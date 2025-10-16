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
    async parseCsv(buffer: Buffer): Promise<CreateSentenceDto[]> {
        return new Promise((resolve, reject) => {
            const results: CreateSentenceDto[] = [];
            const stream = Readable.from(buffer);

            stream
                .pipe(csv({
                    mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, ''), // handle BOM
                }))
                .on('data', (row: CsvRow) => {
                    console.log("Parsing row:", row);
                    // Only validate sentence is required, others are optional
                    if (row.sentence) {
                        results.push({
                            sentence: row.sentence.trim(),
                            original_content: row.original_content?.trim(),
                            bias_category: row.bias_category?.trim(),
                            language: row.language?.trim(),
                        });
                    }
                })
                .on('end', () => {
                    console.log('CSV file successfully processed', results);
                    resolve(results);
                })
                .on('error', (error) => {
                    console.log(error)
                    reject(error);
                });
        });
    }

    async parseXlsx(buffer: Buffer): Promise<CreateSentenceDto[]> {
        try {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as CsvRow[];

            // Map to CreateSentenceDto - only sentence is required
            const results: CreateSentenceDto[] = jsonData
                .filter(row => row.sentence) // Only require sentence
                .map(row => ({
                    sentence: row.sentence!.toString().trim(),
                    original_content: row.original_content?.toString().trim(),
                    bias_category: row.bias_category?.toString().trim(),
                    language: row.language?.toString().trim(),
                })); return results;
        } catch (error) {
            throw new Error(`Failed to parse XLSX file: ${error.message}`);
        }
    }

    async parseFile(buffer: Buffer, filename: string): Promise<CreateSentenceDto[]> {
        const extension = filename.toLowerCase().split('.').pop();
        console.log(extension, 'extension here')
        switch (extension) {
            case 'csv':
                console.log("Parsing as CSV")
                return this.parseCsv(buffer);
            case 'xlsx':
            case 'xls':
                return this.parseXlsx(buffer);
            default:
                throw new Error(`Unsupported file format: ${extension}`);
        }
    }
}