import { Injectable, Logger } from '@nestjs/common';
import { TwitterScraperService } from './twitter-scraper.service';
import {
  TextProcessingService,
  HausaTextAnalysis,
} from '../lib/text-processing.service';
import * as fs from 'fs';
import * as path from 'path';

interface ProcessedTweet {
  id: string;
  text: string;
  cleanedText: string;
  created_at?: string;
  author_username?: string;
  searchWord: string;
  analysis: HausaTextAnalysis | null;
}

@Injectable()
export class HausaTweetCollectorService {
  private readonly logger = new Logger(HausaTweetCollectorService.name);
  private readonly textProcessingService: TextProcessingService;
  private isRunning = false;

  // 20 Common Hausa words for searching
  private readonly hausaWords = [
    'saurayi',
    'budurwa',
    'ehn mata',
    'mutane',
    'al umma',
    'aure',
    'bazawara',
    'er iska',
    'aiki',
    'labari',
    'duniya',
    'kasar',
    'gwamnati',
    'makaranta',
    'yara',
    'mazaje',
    'arziki',
    'banza',
    'lokaci',
    'lafiya',
  ];

  private readonly outputDir = path.join(process.cwd(), 'exports');

  constructor(private readonly twitterScraperService: TwitterScraperService) {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    this.textProcessingService = new TextProcessingService();
  }

  /**
   * Trigger the Hausa tweet collection job manually
   * Uses AI to filter complete sentences and extract metadata
   */
  async collectHausaTweets(options?: {
    maxResultsPerWord?: number;
    wordsToUse?: string[];
    useAiAnalysis?: boolean; // Enable AI analysis for metadata extraction
  }): Promise<{
    success: boolean;
    totalFetched: number;
    totalAnalyzed: number;
    totalSaved: number;
    rejectedPhrases: number;
    filePath: string;
    message: string;
  }> {
    if (this.isRunning) {
      return {
        success: false,
        totalFetched: 0,
        totalAnalyzed: 0,
        totalSaved: 0,
        rejectedPhrases: 0,
        filePath: '',
        message: 'Job is already running. Please wait.',
      };
    }

    this.isRunning = true;
    const useAi = options?.useAiAnalysis !== false; // Default to true
    this.logger.log(
      `🚀 Starting Hausa tweets collection... (AI Analysis: ${useAi ? 'ON' : 'OFF'})`,
    );

    try {
      const words = options?.wordsToUse || this.hausaWords;
      const maxResults = options?.maxResultsPerWord || 50;

      const allTweets: any[] = [];
      const seenIds = new Set<string>();

      this.logger.log(`Fetching tweets for ${words.length} Hausa words...`);

      for (const word of words) {
        try {
          this.logger.log(`Searching for: "${word}"`);

          const result = await this.twitterScraperService.searchTweets({
            query: word,
            maxResults,
            removePii: true,
            filterByLanguage: false, // We'll use AI for better filtering
            targetLanguage: 'hausa',
          });

          if (result.success && result.tweets.length > 0) {
            for (const tweet of result.tweets) {
              if (!seenIds.has(tweet.id)) {
                seenIds.add(tweet.id);
                allTweets.push({ ...tweet, searchWord: word });
              }
            }
            this.logger.log(
              `  Found ${result.tweets.length} tweets for "${word}"`,
            );
          }

          // Small delay to avoid rate limiting
          await this.delay(500);
        } catch (error) {
          this.logger.warn(
            `Failed to fetch tweets for "${word}": ${error.message}`,
          );
        }
      }

      this.logger.log(`Total unique tweets collected: ${allTweets.length}`);

      if (allTweets.length === 0) {
        return {
          success: true,
          totalFetched: 0,
          totalAnalyzed: 0,
          totalSaved: 0,
          rejectedPhrases: 0,
          filePath: '',
          message: 'No tweets found matching the criteria.',
        };
      }

      // Process tweets with AI analysis
      const processedTweets: ProcessedTweet[] = [];
      let rejectedCount = 0;

      if (useAi) {
        this.logger.log(
          `🤖 Analyzing ${allTweets.length} tweets with AI (this may take a while)...`,
        );

        for (let i = 0; i < allTweets.length; i++) {
          const tweet = allTweets[i];

          // Clean text first (remove emojis)
          const cleanedText = this.removeEmojis(tweet.text)
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          // Skip very short texts
          if (cleanedText.length < 15) {
            rejectedCount++;
            continue;
          }

          // Analyze with AI
          const analysis =
            await this.textProcessingService.analyzeHausaText(cleanedText);

          if (analysis) {
            // Only keep complete Hausa sentences
            if (analysis.isCompleteSentence && analysis.isHausa) {
              processedTweets.push({
                id: tweet.id,
                text: tweet.text,
                cleanedText,
                created_at: tweet.created_at,
                author_username: tweet.author_username,
                searchWord: tweet.searchWord,
                analysis,
              });
              this.logger.log(
                `  ✓ [${i + 1}/${allTweets.length}] Complete sentence - Dialect: ${analysis.regionDialect}, Topic: ${analysis.topic}`,
              );
            } else {
              rejectedCount++;
              this.logger.log(
                `  ✗ [${i + 1}/${allTweets.length}] Rejected: ${analysis.reasoning.substring(0, 50)}...`,
              );
            }
          } else {
            // AI failed, keep with default values
            processedTweets.push({
              id: tweet.id,
              text: tweet.text,
              cleanedText,
              created_at: tweet.created_at,
              author_username: tweet.author_username,
              searchWord: tweet.searchWord,
              analysis: null,
            });
          }

          // Rate limiting delay
          await this.delay(200);
        }
      } else {
        // No AI analysis - just clean and keep all
        for (const tweet of allTweets) {
          const cleanedText = this.removeEmojis(tweet.text)
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (cleanedText.length >= 15) {
            processedTweets.push({
              id: tweet.id,
              text: tweet.text,
              cleanedText,
              created_at: tweet.created_at,
              author_username: tweet.author_username,
              searchWord: tweet.searchWord,
              analysis: null,
            });
          } else {
            rejectedCount++;
          }
        }
      }

      this.logger.log(
        `Processed: ${processedTweets.length} complete sentences, rejected: ${rejectedCount} phrases`,
      );

      if (processedTweets.length === 0) {
        return {
          success: true,
          totalFetched: allTweets.length,
          totalAnalyzed: allTweets.length,
          totalSaved: 0,
          rejectedPhrases: rejectedCount,
          filePath: '',
          message: 'No complete Hausa sentences found after analysis.',
        };
      }

      const filePath = await this.saveToCsv(processedTweets);

      this.logger.log(
        `✅ Collection completed. Saved ${processedTweets.length} sentences to ${filePath}`,
      );

      return {
        success: true,
        totalFetched: allTweets.length,
        totalAnalyzed: allTweets.length,
        totalSaved: processedTweets.length,
        rejectedPhrases: rejectedCount,
        filePath,
        message: `Successfully collected ${processedTweets.length} complete Hausa sentences (rejected ${rejectedCount} phrases/fragments).`,
      };
    } catch (error) {
      this.logger.error('Collection failed:', error.message);
      return {
        success: false,
        totalFetched: 0,
        totalAnalyzed: 0,
        totalSaved: 0,
        rejectedPhrases: 0,
        filePath: '',
        message: `Collection failed: ${error.message}`,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async saveToCsv(tweets: ProcessedTweet[]): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `hausa-sentences-${timestamp}.csv`;
    const filePath = path.join(this.outputDir, filename);

    // Data Collection schema headers
    const headers = [
      'language',
      'script',
      'country',
      'region_dialect',
      'source_type',
      'source_ref',
      'collection_date',
      'text',
      'domain',
      'topic',
      'theme',
      'sensitive_characteristic',
      'safety_flag',
      'pii_removed',
    ];

    const rows = tweets.map((tweet) => {
      const tweetUrl = tweet.author_username
        ? `https://twitter.com/${tweet.author_username}/status/${tweet.id}`
        : `https://twitter.com/i/web/status/${tweet.id}`;

      // Use cleaned text and escape quotes for CSV
      const cleanText = tweet.cleanedText.replace(/"/g, '""');

      const collectionDate = tweet.created_at
        ? new Date(tweet.created_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      // Use AI analysis if available, otherwise defaults
      const analysis = tweet.analysis;

      return [
        'hausa',
        'latin',
        'Nigeria',
        analysis?.regionDialect || '',
        'web_public',
        tweetUrl,
        collectionDate,
        `"${cleanText}"`,
        analysis?.domain || 'media_and_online',
        analysis?.topic || tweet.searchWord || '',
        analysis?.theme || 'public_interest',
        analysis?.sensitiveCharacteristic || '',
        analysis?.safetyFlag || 'safe',
        'true',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    fs.writeFileSync(filePath, csvContent, 'utf-8');

    return filePath;
  }

  /**
   * Remove emojis and other unicode symbols from text
   */
  private removeEmojis(text: string): string {
    return (
      text
        // Remove emoji characters
        .replace(
          /[\u{1F600}-\u{1F64F}]/gu, // Emoticons
          '',
        )
        .replace(
          /[\u{1F300}-\u{1F5FF}]/gu, // Misc Symbols and Pictographs
          '',
        )
        .replace(
          /[\u{1F680}-\u{1F6FF}]/gu, // Transport and Map
          '',
        )
        .replace(
          /[\u{1F1E0}-\u{1F1FF}]/gu, // Flags
          '',
        )
        .replace(
          /[\u{2600}-\u{26FF}]/gu, // Misc symbols
          '',
        )
        .replace(
          /[\u{2700}-\u{27BF}]/gu, // Dingbats
          '',
        )
        .replace(
          /[\u{FE00}-\u{FE0F}]/gu, // Variation Selectors
          '',
        )
        .replace(
          /[\u{1F900}-\u{1F9FF}]/gu, // Supplemental Symbols and Pictographs
          '',
        )
        .replace(
          /[\u{1FA00}-\u{1FA6F}]/gu, // Chess Symbols
          '',
        )
        .replace(
          /[\u{1FA70}-\u{1FAFF}]/gu, // Symbols and Pictographs Extended-A
          '',
        )
        .replace(
          /[\u{231A}-\u{231B}]/gu, // Watch, Hourglass
          '',
        )
        .replace(
          /[\u{23E9}-\u{23F3}]/gu, // Various symbols
          '',
        )
        .replace(
          /[\u{23F8}-\u{23FA}]/gu, // Various symbols
          '',
        )
        .replace(
          /[\u{25AA}-\u{25AB}]/gu, // Squares
          '',
        )
        .replace(
          /[\u{25B6}]/gu, // Play button
          '',
        )
        .replace(
          /[\u{25C0}]/gu, // Reverse button
          '',
        )
        .replace(
          /[\u{25FB}-\u{25FE}]/gu, // Squares
          '',
        )
        .replace(
          /[\u{2934}-\u{2935}]/gu, // Arrows
          '',
        )
        .replace(
          /[\u{2B05}-\u{2B07}]/gu, // Arrows
          '',
        )
        .replace(
          /[\u{2B1B}-\u{2B1C}]/gu, // Squares
          '',
        )
        .replace(
          /[\u{2B50}]/gu, // Star
          '',
        )
        .replace(
          /[\u{2B55}]/gu, // Circle
          '',
        )
        .replace(
          /[\u{3030}]/gu, // Wavy dash
          '',
        )
        .replace(
          /[\u{303D}]/gu, // Part alternation mark
          '',
        )
        .replace(
          /[\u{3297}]/gu, // Circled Ideograph Congratulation
          '',
        )
        .replace(
          /[\u{3299}]/gu, // Circled Ideograph Secret
          '',
        )
        .replace(
          /[\u{200D}]/gu, // Zero width joiner
          '',
        )
        .replace(
          /[\u{20E3}]/gu, // Combining enclosing keycap
          '',
        )
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getHausaWords(): string[] {
    return [...this.hausaWords];
  }

  getStatus(): { isRunning: boolean; outputDir: string; wordCount: number } {
    return {
      isRunning: this.isRunning,
      outputDir: this.outputDir,
      wordCount: this.hausaWords.length,
    };
  }
}
