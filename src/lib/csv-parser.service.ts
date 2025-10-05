import { Injectable } from '@nestjs/common';
import * as csv from 'csv-parser';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import { CreateSentenceDto } from '../sentences/dto/create-sentence.dto';

export interface CsvRow {
    sentence?: string;
    original_content?: string;
    bias_category?: string;
    language?: string;
}

@Injectable()
export class CsvParserService {
    async parseCsv(buffer: Buffer, documentId?: string): Promise<CreateSentenceDto[]> {
        return new Promise((resolve, reject) => {
            const results: CreateSentenceDto[] = [];
            const stream = Readable.from(buffer);

            stream
                .pipe(csv())
                .on('data', (row: CsvRow) => {
                    // Validate and map CSV row to CreateSentenceDto
                    if (row.sentence && row.bias_category) {
                        results.push({
                            sentence: row.sentence.trim(),
                            original_content: row.original_content?.trim() || '',
                            bias_category: row.bias_category.trim(),
                            language: row.language?.trim() || 'en',
                            document_id: documentId,
                        });
                    }
                })
                .on('end', () => {
                    resolve(results);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    } async parseXlsx(buffer: Buffer, documentId?: string): Promise<CreateSentenceDto[]> {
        try {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as CsvRow[];

            // Map to CreateSentenceDto
            const results: CreateSentenceDto[] = jsonData
                .filter(row => row.sentence && row.bias_category)
                .map(row => ({
                    sentence: row.sentence!.toString().trim(),
                    original_content: row.original_content?.toString().trim() || '',
                    bias_category: row.bias_category!.toString().trim(),
                    language: row.language?.toString().trim() || 'en',
                    document_id: documentId,
                }));

            return results;
        } catch (error) {
            throw new Error(`Failed to parse XLSX file: ${error.message}`);
        }
    }

    async parseFile(buffer: Buffer, filename: string, documentId?: string): Promise<CreateSentenceDto[]> {
        const extension = filename.toLowerCase().split('.').pop();

        switch (extension) {
            case 'csv':
                return this.parseCsv(buffer, documentId);
            case 'xlsx':
            case 'xls':
                return this.parseXlsx(buffer, documentId);
            default:
                throw new Error(`Unsupported file format: ${extension}`);
        }
    }
}