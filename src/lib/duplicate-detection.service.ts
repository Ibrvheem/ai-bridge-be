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
    validSentences: CreateSentenceDto[];
    duplicates: Array<{
        sentence: string;
        original_content: string;
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
    ) { }

    async bulkCheckDuplicates(sentences: CreateSentenceDto[]): Promise<Map<string, string>> {
        try {
            // Create search criteria for all sentences at once
            const searchCriteria = sentences
                .filter(s => s.sentence) // Only check sentences that have content
                .map(s => ({
                    sentence: s.sentence.trim(),
                    original_content: s.original_content?.trim() || ''
                }));

            if (searchCriteria.length === 0) {
                return new Map();
            }

            // Single database query to find all duplicates
            const existingDuplicates = await this.sentenceModel.find({
                $or: searchCriteria
            }).select('sentence original_content document_id').lean().exec();

            // Create lookup map for O(1) duplicate detection
            const duplicateMap = new Map<string, string>();
            existingDuplicates.forEach(doc => {
                const key = `${doc.sentence}|${doc.original_content || ''}`;
                duplicateMap.set(key, doc.document_id);
            });

            return duplicateMap;
        } catch (error) {
            console.error('Error in bulk duplicate check:', error);
            return new Map();
        }
    }

    async checkForDuplicate(
        sentence: string,
        originalContent: string
    ): Promise<DuplicateCheckResult> {
        try {
            // Check for exact match on sentence and original_content
            const existingSentence = await this.sentenceModel.findOne({
                sentence: sentence.trim(),
                original_content: originalContent?.trim() || ''
            }).exec();

            if (existingSentence) {
                return {
                    isDuplicate: true,
                    existingDocumentId: existingSentence.document_id,
                    existingSentence
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
        documentId: string
    ): Promise<ProcessingResult> {
        const validSentences: CreateSentenceDto[] = [];
        const duplicates: ProcessingResult['duplicates'] = [];
        const errors: ProcessingResult['errors'] = [];

        // Step 1: Validate all sentences first
        const validatedSentences = sentences.map((sentence, index) => ({
            sentence,
            rowNumber: index + 1,
            isValid: Boolean(sentence.sentence)
        }));

        // Collect validation errors
        validatedSentences.forEach(({ sentence, rowNumber, isValid }) => {
            if (!isValid) {
                errors.push({
                    row_number: rowNumber,
                    error: 'Missing required field: sentence',
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
                const duplicateKey = `${sentence.sentence.trim()}|${sentence.original_content?.trim() || ''}`;
                const existingDocumentId = duplicateMap.get(duplicateKey);

                if (existingDocumentId) {
                    // Found duplicate
                    duplicates.push({
                        sentence: sentence.sentence,
                        original_content: sentence.original_content || '',
                        existing_document_id: existingDocumentId,
                        row_number: rowNumber
                    });
                } else {
                    // Valid sentence, add to processing list
                    validSentences.push({
                        ...sentence,
                        document_id: documentId
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
        return this.sentenceModel.aggregate([
            { $match: { document_id: documentId } },
            {
                $group: {
                    _id: {
                        sentence: '$sentence',
                        original_content: '$original_content'
                    },
                    count: { $sum: 1 },
                    documents: { $addToSet: '$document_id' }
                }
            },
            { $match: { count: { $gt: 1 } } }
        ]).exec();
    }
}