import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Sentences } from '../sentences/sentences.schema';
import { CreateSentenceDto } from '../sentences/dto/create-sentence.dto';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingDocumentId?: string;
  existingSentence?: any;
}

export interface ProcessingResult {
  validSentences: (CreateSentenceDto & { document_id?: string })[];
  duplicates: Array<{
    text: string;
    existing_document_id: string;
    row_number: number;
  }>;
  errors: Array<{
    row_number: number;
    error: string;
  }>;
}

@Injectable()
export class DuplicateDetectionService {
  constructor(
    @InjectModel('Sentences') private sentenceModel: Model<Sentences>,
  ) {}

  async bulkCheckDuplicates(
    sentences: CreateSentenceDto[],
  ): Promise<Map<string, string>> {
    try {
      // Create search criteria for all sentences at once
      const searchCriteria = sentences
        .filter((s) => s.text) // Only check sentences that have content
        .map((s) => ({
          text: s.text.trim(),
        }));

      if (searchCriteria.length === 0) {
        return new Map();
      }

      // Single database query to find all duplicates
      const existingDuplicates = await this.sentenceModel
        .find({
          $or: searchCriteria,
        })
        .select('text')
        .lean()
        .exec();

      // Create lookup map for O(1) duplicate detection
      const duplicateMap = new Map<string, string>();
      existingDuplicates.forEach((doc) => {
        const key = doc.text;
        duplicateMap.set(key, doc._id.toString());
      });

      return duplicateMap;
    } catch (error) {
      console.error('Error in bulk duplicate check:', error);
      return new Map();
    }
  }

  async checkForDuplicate(text: string): Promise<DuplicateCheckResult> {
    try {
      // Check for exact match on text
      const existingSentence = await this.sentenceModel
        .findOne({
          text: text.trim(),
        })
        .exec();

      if (existingSentence) {
        return {
          isDuplicate: true,
          existingDocumentId: existingSentence._id.toString(),
          existingSentence,
        };
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return { isDuplicate: false };
    }
  }

  async processSentencesWithDuplicateCheck(
    sentences: CreateSentenceDto[],
    documentId: string,
  ): Promise<ProcessingResult> {
    const validSentences: (CreateSentenceDto & { document_id?: string })[] = [];
    const duplicates: ProcessingResult['duplicates'] = [];
    const errors: ProcessingResult['errors'] = [];

    // Step 1: Validate all sentences first
    const validatedSentences = sentences.map((sentence, index) => ({
      sentence,
      rowNumber: index + 1,
      isValid: Boolean(sentence.text),
    }));

    // Collect validation errors
    validatedSentences.forEach(({ sentence, rowNumber, isValid }) => {
      if (!isValid) {
        errors.push({
          row_number: rowNumber,
          error: 'Missing required field: text',
        });
      }
    });

    // Get only valid sentences for duplicate checking
    const sentencesToCheck = validatedSentences
      .filter(({ isValid }) => isValid)
      .map(({ sentence }) => sentence);

    if (sentencesToCheck.length === 0) {
      return { validSentences, duplicates, errors };
    }

    // Step 2: Bulk duplicate detection (single database query)
    const duplicateMap = await this.bulkCheckDuplicates(sentencesToCheck);

    // Step 3: Process results using the duplicate map
    validatedSentences.forEach(({ sentence, rowNumber, isValid }) => {
      if (!isValid) return; // Skip invalid sentences (already added to errors)

      try {
        const duplicateKey = sentence.text.trim();
        const existingDocumentId = duplicateMap.get(duplicateKey);

        if (existingDocumentId) {
          // Found duplicate
          duplicates.push({
            text: sentence.text,
            existing_document_id: existingDocumentId,
            row_number: rowNumber,
          });
        } else {
          // Valid sentence, add to processing list
          validSentences.push({
            ...sentence,
            document_id: documentId,
          });
        }
      } catch (error) {
        errors.push({
          row_number: rowNumber,
          error: error.message || 'Unknown processing error',
        });
      }
    });

    return { validSentences, duplicates, errors };
  }

  async getBatchDuplicateStats(documentId: string) {
    return this.sentenceModel
      .aggregate([
        { $match: { document_id: documentId } },
        {
          $group: {
            _id: {
              text: '$text',
            },
            count: { $sum: 1 },
            documents: { $addToSet: '$document_id' },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .exec();
  }
}
