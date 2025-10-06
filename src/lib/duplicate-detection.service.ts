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

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            const rowNumber = i + 1;

            try {
                // Validate required fields - only sentence is required now
                if (!sentence.sentence) {
                    errors.push({
                        row_number: rowNumber,
                        error: 'Missing required field: sentence',
                    });
                    continue;
                }                // Check for duplicates
                const duplicateCheck = await this.checkForDuplicate(
                    sentence.sentence,
                    sentence.original_content || ''
                );

                if (duplicateCheck.isDuplicate) {
                    duplicates.push({
                        sentence: sentence.sentence,
                        original_content: sentence.original_content || '',
                        existing_document_id: duplicateCheck.existingDocumentId!,
                        row_number: rowNumber
                    });
                    continue;
                }

                // Add to valid sentences with document_id
                validSentences.push({
                    ...sentence,
                    document_id: documentId
                });

            } catch (error) {
                errors.push({
                    row_number: rowNumber,
                    error: error.message || 'Unknown processing error',
                });
            }
        }

        return {
            validSentences,
            duplicates,
            errors
        };
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