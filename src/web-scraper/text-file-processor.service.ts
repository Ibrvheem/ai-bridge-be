import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  TextProcessingService,
  HausaTextAnalysis,
} from '../lib/text-processing.service';

export interface ProcessedSentence {
  text: string;
  cleanedText: string;
  piiRemoved: boolean;
  analysis: HausaTextAnalysis | null;
}

export interface FileProcessingResult {
  success: boolean;
  sourceFile: string;
  sourceRef: string;
  language: string;
  totalLines: number;
  uniqueSentences: number;
  processedSentences: number;
  rejectedSentences: number;
  savedFilePath: string;
  /** Structured data ready for DB insertion */
  structuredData: Record<string, any>[];
  message: string;
}

@Injectable()
export class TextFileProcessorService {
  private readonly logger = new Logger(TextFileProcessorService.name);
  private readonly textProcessingService: TextProcessingService;
  private readonly outputDir = path.join(process.cwd(), 'exports');

  constructor() {
    this.textProcessingService = new TextProcessingService();

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Process a raw text file (one sentence per line or paragraph-based)
   * - Deduplicates lines
   * - Removes PII
   * - Runs AI analysis to fill DataCollection schema fields
   * - Saves structured CSV output
   */
  async processTextFile(options: {
    fileBuffer?: Buffer;
    fileName?: string;
    rawText?: string;
    language: string;
    country: string;
    sourceRef: string;
    sourceType?: string;
    script?: string;
    collectorId?: string;
    useAiAnalysis?: boolean;
  }): Promise<FileProcessingResult> {
    const {
      fileBuffer,
      fileName,
      rawText,
      language,
      country,
      sourceRef,
      sourceType = 'web_public',
      script = 'latin',
      collectorId,
      useAiAnalysis = true,
    } = options;

    this.logger.log(
      `Processing: ${fileName || 'raw text input'} (${language}, ${sourceRef})`,
    );

    // Step 1: Get the text content
    let text: string;
    if (fileBuffer) {
      text = fileBuffer.toString('utf-8');
    } else if (rawText) {
      text = rawText;
    } else {
      return {
        success: false,
        sourceFile: '',
        sourceRef,
        language,
        totalLines: 0,
        uniqueSentences: 0,
        processedSentences: 0,
        rejectedSentences: 0,
        savedFilePath: '',
        structuredData: [],
        message: 'No file or raw text provided',
      };
    }

    // Step 2: Split into sentences (handles articles & line-based text) and deduplicate
    const allSentences = this.splitIntoSentences(text);
    const uniqueSentences = [...new Set(allSentences)];

    this.logger.log(
      `Total sentences: ${allSentences.length}, Unique: ${uniqueSentences.length}`,
    );

    // Step 3: Remove PII from each sentence
    const piiProcessed = uniqueSentences.map((sentence) => {
      const { cleanedText, removedPii } =
        this.textProcessingService.removePii(sentence);
      return {
        original: sentence,
        cleanedText,
        piiRemoved: removedPii.length > 0,
      };
    });

    // Step 4: AI analysis (if enabled)
    const processedSentences: ProcessedSentence[] = [];
    let rejectedCount = 0;

    if (useAiAnalysis) {
      this.logger.log('Running AI analysis on sentences...');

      for (let i = 0; i < piiProcessed.length; i++) {
        const item = piiProcessed[i];

        try {
          let analysis: HausaTextAnalysis | null = null;

          if (language.toLowerCase() === 'hausa') {
            analysis = await this.textProcessingService.analyzeHausaText(
              item.cleanedText,
            );
          } else if (language.toLowerCase() === 'yoruba') {
            analysis = await this.textProcessingService.analyzeYorubaText(
              item.cleanedText,
            );
          }

          // Keep all sentences — AI is only used for metadata, not filtering
          processedSentences.push({
            text: item.original,
            cleanedText: item.cleanedText,
            piiRemoved: item.piiRemoved,
            analysis,
          });

          // Log progress every 5 sentences
          if ((i + 1) % 5 === 0) {
            this.logger.log(
              `Analyzed ${i + 1}/${piiProcessed.length} sentences`,
            );
          }

          // Rate limit AI calls (200ms)
          await this.sleep(200);
        } catch (error) {
          this.logger.warn(`AI analysis failed: ${error.message}`);
          // Keep without analysis if AI fails
          processedSentences.push({
            text: item.original,
            cleanedText: item.cleanedText,
            piiRemoved: item.piiRemoved,
            analysis: null,
          });
        }
      }
    } else {
      // No AI analysis — keep all sentences
      for (const item of piiProcessed) {
        processedSentences.push({
          text: item.original,
          cleanedText: item.cleanedText,
          piiRemoved: item.piiRemoved,
          analysis: null,
        });
      }
    }

    this.logger.log(
      `Processing complete: ${processedSentences.length} accepted, ${rejectedCount} rejected`,
    );

    // Step 5: Structure into DataCollection schema
    const collectionDate = new Date().toISOString().split('T')[0];
    const structuredData = processedSentences.map((s) => ({
      language,
      script,
      country,
      region_dialect: s.analysis?.regionDialect || '',
      source_type: sourceType,
      source_ref: sourceRef,
      collection_date: collectionDate,
      text: s.cleanedText,
      domain: s.analysis?.domain || '',
      topic: s.analysis?.topic || '',
      theme: s.analysis?.theme || '',
      sensitive_characteristic: s.analysis?.sensitiveCharacteristic || '',
      safety_flag: s.analysis?.safetyFlag || 'safe',
      pii_removed: s.piiRemoved,
      collector_id: collectorId || '',
    }));

    // Step 6: Save to CSV
    const savedFilePath = await this.saveToCsv(
      structuredData,
      language,
      sourceRef,
    );

    return {
      success: true,
      sourceFile: fileName || 'raw_text',
      sourceRef,
      language,
      totalLines: allSentences.length,
      uniqueSentences: uniqueSentences.length,
      processedSentences: processedSentences.length,
      rejectedSentences: rejectedCount,
      savedFilePath,
      structuredData,
      message: `Successfully processed ${processedSentences.length} sentences from ${sourceRef} (${rejectedCount} rejected)`,
    };
  }

  /**
   * Split text into sentences — handles both article-style paragraphs and line-based text.
   * Articles are broken down at sentence boundaries (. ! ? and Hausa/Yoruba punctuation).
   */
  private splitIntoSentences(text: string): string[] {
    // First split by double newlines (paragraph boundaries) and single newlines
    const blocks = text
      .split(/\n\s*\n/) // split on blank lines (paragraph breaks)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);

    const sentences: string[] = [];

    for (const block of blocks) {
      // Within each block, split by single newlines to get lines
      const lines = block
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const line of lines) {
        // Always try to split on sentence-ending punctuation
        // This handles both long article paragraphs and shorter lines that
        // may contain multiple sentences
        const subSentences = line
          .split(/(?<=[.!?।])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 10);

        if (subSentences.length > 1) {
          // Multiple sentences found in this line
          sentences.push(...subSentences);
        } else if (line.length >= 10) {
          // Single sentence or line without clear punctuation boundaries
          sentences.push(line);
        }
      }
    }

    return sentences;
  }

  /**
   * Save structured data to CSV following DataCollection schema
   */
  private async saveToCsv(
    data: Record<string, any>[],
    language: string,
    sourceRef: string,
  ): Promise<string> {
    if (data.length === 0) return '';

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = sourceRef.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const filename = `${language}-${safeName}-${timestamp}.csv`;
    const filePath = path.join(this.outputDir, filename);

    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? '');
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        })
        .join(','),
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    this.logger.log(`Saved ${data.length} sentences to ${filePath}`);
    return filePath;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
