import { Injectable } from '@nestjs/common';
import * as csv from 'csv-parser';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import { CreateSentenceDto } from '../sentences/dto/create-sentence.dto';
import {
  Script,
  SourceType,
  Domain,
  Theme,
  SensitiveCharacteristic,
  SafetyFlag,
} from '../sentences/types/data-collection.types';

export interface CsvRow {
  text?: string;
  language?: string;
  script?: string;
  country?: string;
  region_dialect?: string;
  source_type?: string;
  source_ref?: string;
  collection_date?: string;
  domain?: string;
  topic?: string;
  theme?: string;
  sensitive_characteristic?: string;
  safety_flag?: string;
  pii_removed?: string;
  notes?: string;
}

@Injectable()
export class CsvParserService {
  private parseBoolean(value: string | undefined): boolean {
    if (!value) return false;
    return ['true', '1', 'yes'].includes(value.toLowerCase().trim());
  }

  private parseEnum<T extends Record<string, string>>(
    value: string | undefined,
    enumObj: T,
  ): T[keyof T] | undefined {
    if (!value) return undefined;
    const normalizedValue = value.toLowerCase().trim();
    const enumValues = Object.values(enumObj) as string[];
    if (enumValues.includes(normalizedValue)) {
      return normalizedValue as T[keyof T];
    }
    return undefined;
  }

  private mapRowToDto(row: CsvRow): CreateSentenceDto | null {
    if (
      !row.text ||
      !row.language ||
      !row.country ||
      !row.source_type ||
      !row.domain ||
      !row.theme
    ) {
      return null;
    }

    const sourceType = this.parseEnum(row.source_type, SourceType);
    const domain = this.parseEnum(row.domain, Domain);
    const theme = this.parseEnum(row.theme, Theme);

    if (!sourceType || !domain || !theme) {
      return null;
    }

    return {
      text: row.text.trim(),
      language: row.language.trim(),
      script: this.parseEnum(row.script, Script) || Script.LATIN,
      country: row.country.trim(),
      region_dialect: row.region_dialect?.trim(),
      source_type: sourceType,
      source_ref: row.source_ref?.trim(),
      collection_date: row.collection_date
        ? new Date(row.collection_date)
        : undefined,
      domain: domain,
      topic: row.topic?.trim(),
      theme: theme,
      sensitive_characteristic:
        this.parseEnum(row.sensitive_characteristic, SensitiveCharacteristic) ||
        null,
      safety_flag:
        this.parseEnum(row.safety_flag, SafetyFlag) || SafetyFlag.SAFE,
      pii_removed: this.parseBoolean(row.pii_removed),
      notes: row.notes?.trim() || null,
    };
  }

  async parseCsv(buffer: Buffer): Promise<CreateSentenceDto[]> {
    return new Promise((resolve, reject) => {
      const results: CreateSentenceDto[] = [];
      const stream = Readable.from(buffer);

      stream
        .pipe(
          csv({
            mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, ''),
          }),
        )
        .on('data', (row: CsvRow) => {
          console.log('Parsing row:', row);
          const dto = this.mapRowToDto(row);
          if (dto) {
            results.push(dto);
          }
        })
        .on('end', () => {
          console.log('CSV file successfully processed', results);
          resolve(results);
        })
        .on('error', (error) => {
          console.log(error);
          reject(error);
        });
    });
  }

  async parseXlsx(buffer: Buffer): Promise<CreateSentenceDto[]> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet) as CsvRow[];

      const results: CreateSentenceDto[] = jsonData
        .map((row) =>
          this.mapRowToDto({
            text: row.text?.toString(),
            language: row.language?.toString(),
            script: row.script?.toString(),
            country: row.country?.toString(),
            region_dialect: row.region_dialect?.toString(),
            source_type: row.source_type?.toString(),
            source_ref: row.source_ref?.toString(),
            collection_date: row.collection_date?.toString(),
            domain: row.domain?.toString(),
            topic: row.topic?.toString(),
            theme: row.theme?.toString(),
            sensitive_characteristic: row.sensitive_characteristic?.toString(),
            safety_flag: row.safety_flag?.toString(),
            pii_removed: row.pii_removed?.toString(),
            notes: row.notes?.toString(),
          }),
        )
        .filter((dto): dto is CreateSentenceDto => dto !== null);

      return results;
    } catch (error) {
      throw new Error(`Failed to parse XLSX file: ${error.message}`);
    }
  }

  async parseFile(
    buffer: Buffer,
    filename: string,
  ): Promise<CreateSentenceDto[]> {
    const extension = filename.toLowerCase().split('.').pop();
    console.log(extension, 'extension here');
    switch (extension) {
      case 'csv':
        console.log('Parsing as CSV');
        return this.parseCsv(buffer);
      case 'xlsx':
      case 'xls':
        return this.parseXlsx(buffer);
      default:
        throw new Error(`Unsupported file format: ${extension}`);
    }
  }
}
