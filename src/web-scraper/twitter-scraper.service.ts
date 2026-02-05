import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  SearchTweetsDto,
  GetUserTweetsDto,
  GetTweetsByHashtagDto,
  TweetData,
  TwitterApiResponse,
  ScrapedTweetsResult,
  TweetSearchType,
  ExportTweetsToCsvDto,
} from './dto/twitter-scraper.dto';
import {
  Script,
  SourceType,
  Domain,
  Theme,
  SafetyFlag,
} from '../sentences/types/data-collection.types';
import {
  TextProcessingService,
  TextProcessingResult,
} from '../lib/text-processing.service';

@Injectable()
export class TwitterScraperService {
  private readonly logger = new Logger(TwitterScraperService.name);
  private readonly apiClient: AxiosInstance;
  private readonly baseUrl = 'https://api.twitter.com/2';
  private readonly textProcessingService: TextProcessingService;

  constructor() {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;

    if (!bearerToken) {
      this.logger.warn(
        'TWITTER_BEARER_TOKEN not set. Twitter scraping will not work.',
      );
    }

    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.textProcessingService = new TextProcessingService();
  }

  /**
   * Search tweets using Twitter API v2
   * Supports recent search (last 7 days) or all tweets (with Academic Research access)
   * Optionally removes PII and filters by language
   */
  async searchTweets(dto: SearchTweetsDto): Promise<ScrapedTweetsResult> {
    try {
      const endpoint =
        dto.searchType === TweetSearchType.ALL
          ? '/tweets/search/all'
          : '/tweets/search/recent';

      // Build query with language filter and exclude retweets
      let query = dto.query;

      // Exclude retweets by default (unless query already contains is:retweet)
      if (!query.includes('is:retweet')) {
        query += ' -is:retweet';
      }

      if (dto.language) {
        query += ` lang:${dto.language}`;
      }

      // Twitter API v2 requires max_results between 10 and 100 for search
      const maxResults = Math.min(Math.max(dto.maxResults || 10, 10), 100);

      const params: Record<string, any> = {
        query,
        max_results: maxResults,
        'tweet.fields':
          'created_at,author_id,public_metrics,lang,source,conversation_id',
        'user.fields': 'name,username',
        expansions: 'author_id',
      };

      if (dto.nextToken) {
        params.next_token = dto.nextToken;
      }
      if (dto.startTime) {
        params.start_time = dto.startTime;
      }
      if (dto.endTime) {
        params.end_time = dto.endTime;
      }

      this.logger.log(
        `Searching tweets with query: ${query}, max_results: ${maxResults}`,
      );

      const response = await this.apiClient.get<TwitterApiResponse>(endpoint, {
        params,
      });

      let tweets = this.mapTweetsWithAuthors(response.data);
      const originalCount = tweets.length;
      let rejectedCount = 0;

      // Apply text processing if enabled (PII removal and/or language filtering)
      if (dto.removePii || dto.filterByLanguage) {
        const targetLanguage = dto.targetLanguage || 'hausa';
        const minConfidence = dto.minLanguageConfidence || 0.5;

        this.logger.log(
          `Processing ${tweets.length} tweets - RemovePII: ${dto.removePii}, FilterByLang: ${dto.filterByLanguage}, UseAI: ${dto.useAiValidation}`,
        );

        const processedResults = await Promise.all(
          tweets.map(async (tweet) => {
            let text = tweet.text;
            let isValidLanguage = true;

            // Remove PII if enabled (usernames, URLs, emails, phones)
            if (dto.removePii) {
              const piiResult = this.textProcessingService.removePii(text);
              text = piiResult.cleanedText;
            }

            // Validate language if enabled
            if (dto.filterByLanguage) {
              if (dto.useAiValidation) {
                // Use Claude Haiku for high-confidence validation
                const aiResult =
                  await this.textProcessingService.validateLanguageWithAI(
                    text,
                    targetLanguage,
                  );
                isValidLanguage =
                  aiResult.isTargetLanguage &&
                  aiResult.confidence >= minConfidence;
              } else {
                // Use free local detection (franc)
                const localResult =
                  await this.textProcessingService.detectLanguageLocal(text);
                // Hausa is 'hau' in ISO 639-3
                const isHausa = localResult.language === 'hau';
                isValidLanguage =
                  isHausa && localResult.confidence >= minConfidence;
              }
            }

            return { tweet: { ...tweet, text }, isValidLanguage };
          }),
        );

        // Filter tweets if language filtering is enabled
        if (dto.filterByLanguage) {
          const beforeFilter = processedResults.length;
          tweets = processedResults
            .filter((r) => r.isValidLanguage)
            .map((r) => r.tweet);
          rejectedCount = beforeFilter - tweets.length;
          this.logger.log(
            `Language filter: kept ${tweets.length}/${beforeFilter} tweets (rejected ${rejectedCount})`,
          );
        } else {
          tweets = processedResults.map((r) => r.tweet);
        }
      }

      // Save to CSV file if enabled
      let savedFile:
        | { path: string; filename: string; rowCount: number }
        | undefined;
      if (dto.saveToFile && tweets.length > 0) {
        savedFile = await this.saveTweetsToCsv(tweets, dto);
      }

      return {
        success: true,
        tweets,
        totalCount: tweets.length,
        nextToken: response.data.meta?.next_token,
        query: dto.query,
        language: dto.language,
        processingStats:
          dto.removePii || dto.filterByLanguage
            ? {
                originalCount,
                afterLanguageFilter: tweets.length,
                piiRemoved: dto.removePii || false,
                languageFiltered: dto.filterByLanguage || false,
                rejectedCount,
              }
            : undefined,
        savedFile,
      };
    } catch (error) {
      this.handleApiError(error, 'searchTweets');
    }
  }

  /**
   * Get tweets from a specific user by username
   */
  async getUserTweets(dto: GetUserTweetsDto): Promise<ScrapedTweetsResult> {
    try {
      // First, get the user ID from username
      this.logger.log(`Looking up user: ${dto.username}`);
      const userResponse = await this.apiClient.get(
        `/users/by/username/${dto.username}`,
      );

      if (!userResponse.data?.data?.id) {
        throw new HttpException(
          `User '${dto.username}' not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      const userId = userResponse.data.data.id;
      this.logger.log(`Found user ID: ${userId}`);

      // Twitter API v2 requires max_results between 5 and 100 for user tweets
      const maxResults = Math.min(Math.max(dto.maxResults || 10, 5), 100);

      const params: Record<string, any> = {
        max_results: maxResults,
        'tweet.fields':
          'created_at,author_id,public_metrics,lang,source,conversation_id',
      };

      if (dto.nextToken) {
        params.pagination_token = dto.nextToken;
      }
      if (dto.startTime) {
        params.start_time = dto.startTime;
      }
      if (dto.endTime) {
        params.end_time = dto.endTime;
      }

      const response = await this.apiClient.get<TwitterApiResponse>(
        `/users/${userId}/tweets`,
        { params },
      );

      const tweets = (response.data.data || []).map((tweet) => ({
        ...tweet,
        author_username: dto.username,
      }));

      return {
        success: true,
        tweets,
        totalCount: response.data.meta?.result_count || tweets.length,
        nextToken: response.data.meta?.next_token,
      };
    } catch (error) {
      this.handleApiError(error, 'getUserTweets');
    }
  }

  /**
   * Search tweets FROM a specific user (uses search API - more reliable)
   * This is an alternative to getUserTweets that doesn't require user timeline access
   */
  async searchUserTweets(
    username: string,
    maxResults: number = 100,
    nextToken?: string,
    language?: string,
  ): Promise<ScrapedTweetsResult> {
    // Use the from: operator to search tweets from a specific user
    let query = `from:${username} -is:retweet`;

    return this.searchTweets({
      query,
      maxResults,
      nextToken,
      language,
    });
  }

  /**
   * Search tweets by hashtag
   */
  async getTweetsByHashtag(
    dto: GetTweetsByHashtagDto,
  ): Promise<ScrapedTweetsResult> {
    const hashtag = dto.hashtag.startsWith('#')
      ? dto.hashtag
      : `#${dto.hashtag}`;

    return this.searchTweets({
      query: hashtag,
      maxResults: dto.maxResults,
      nextToken: dto.nextToken,
      language: dto.language,
    });
  }

  /**
   * Search for tweets in a specific language (useful for Hausa, Yoruba, etc.)
   */
  async searchByLanguage(
    language: string,
    additionalQuery?: string,
    maxResults: number = 100,
    nextToken?: string,
  ): Promise<ScrapedTweetsResult> {
    // Twitter API doesn't accept wildcard-only queries
    // Use a broad query that matches most tweets, combined with language filter
    // Using common words or -is:nullcast to get real tweets
    const query = additionalQuery || '-is:retweet -is:reply';

    return this.searchTweets({
      query,
      language,
      maxResults,
      nextToken,
    });
  }

  /**
   * Get Hausa tweets with common Hausa keywords to improve accuracy
   */
  async getHausaTweets(
    maxResults: number = 100,
    nextToken?: string,
  ): Promise<ScrapedTweetsResult> {
    // Common Hausa words/phrases to help identify Hausa content
    // Using distinctive Hausa words that are less likely to appear in other languages
    const hausaKeywords = [
      // Religious terms (Islam vs Christianity tensions)
      'musulmi', // Muslim
      'nasara', // Christian (can be neutral or pejorative)
      'arna', // pagan/unbeliever (derogatory)
      'kafiri', // infidel (derogatory)

      // Ethnic/Regional identity
      'bahaushe', // Hausa person
      'bayarabe', // Fulani person
      'bature', // white person/foreigner
      'inyamurai', // Igbo (can be pejorative)
      'yarbawa', // Yoruba people
      'dan arewa', // northerner
      'dan kudu', // southerner

      // Gender-related (often biased)
      'karuwai', // prostitutes (derogatory)
      'kishiya', // co-wife/rival
      'banza', // worthless (often toward women)

      // Political/Corruption
      'cin hanci', // corruption/bribery
      'zalunci', // oppression/injustice
      'rashawa', // bribery

      // Conflict/Security (herder-farmer, Boko Haram)
      'miyetti', // cattle (herder conflicts)
      "yan ta'adda", // terrorists/bandits
      'yan daba', // thugs/hooligans
      'almajiri', // street children (controversial topic)
      'sace', // kidnapping
      'kisan kiyashi', // massacre
    ];

    // Create a query with OR operators for common distinctive words
    // Limit to avoid query length issues
    const query = `(${hausaKeywords.slice(0, 8).join(' OR ')}) -is:retweet`;

    return this.searchTweets({
      query,
      language: 'ht', // ISO 639-1 code for Hausa
      maxResults,
      nextToken,
    });
  }

  /**
   * Get trending topics for a specific location
   */
  async getTrends(woeid: number = 1): Promise<any> {
    try {
      // Note: Trends API uses v1.1 endpoint
      const response = await axios.get(
        `https://api.twitter.com/1.1/trends/place.json`,
        {
          params: { id: woeid },
          headers: {
            Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
          },
        },
      );

      return {
        success: true,
        trends: response.data[0]?.trends || [],
        location: response.data[0]?.locations[0]?.name,
      };
    } catch (error) {
      this.handleApiError(error, 'getTrends');
    }
  }

  /**
   * Extract clean text from tweets (removes URLs, mentions, etc.)
   */
  extractCleanText(tweets: TweetData[]): string[] {
    return tweets
      .map((tweet) => {
        let text = tweet.text;
        // Remove URLs
        text = text.replace(/https?:\/\/\S+/g, '');
        // Remove mentions
        text = text.replace(/@\w+/g, '');
        // Remove hashtags (optional - might want to keep for context)
        // text = text.replace(/#\w+/g, '');
        // Remove extra whitespace
        text = text.replace(/\s+/g, ' ').trim();
        return text;
      })
      .filter((text) => text.length > 10); // Filter out very short texts
  }

  /**
   * Map tweets with author information from includes
   */
  private mapTweetsWithAuthors(response: TwitterApiResponse): TweetData[] {
    if (!response.data) return [];

    const userMap = new Map<string, { name: string; username: string }>();

    if (response.includes?.users) {
      response.includes.users.forEach((user) => {
        userMap.set(user.id, { name: user.name, username: user.username });
      });
    }

    return response.data.map((tweet) => {
      const author = userMap.get(tweet.author_id || '');
      return {
        ...tweet,
        author_name: author?.name,
        author_username: author?.username,
      };
    });
  }

  /**
   * Handle API errors and throw appropriate exceptions
   */
  private handleApiError(error: any, method: string): never {
    this.logger.error(
      `Twitter API error in ${method}:`,
      error.response?.data || error.message,
    );

    if (error.response) {
      const status = error.response.status;
      const message =
        error.response.data?.detail ||
        error.response.data?.title ||
        'Twitter API error';

      switch (status) {
        case 401:
          throw new HttpException(
            'Twitter API authentication failed. Check your bearer token.',
            HttpStatus.UNAUTHORIZED,
          );
        case 403:
          throw new HttpException(
            'Twitter API access forbidden. Check your API permissions.',
            HttpStatus.FORBIDDEN,
          );
        case 429:
          throw new HttpException(
            'Twitter API rate limit exceeded. Please try again later.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        default:
          throw new HttpException(message, status);
      }
    }

    throw new HttpException(
      'Failed to connect to Twitter API',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /**
   * Save tweets to CSV file on the server following the data collection schema
   */
  private async saveTweetsToCsv(
    tweets: TweetData[],
    dto: SearchTweetsDto,
  ): Promise<{ path: string; filename: string; rowCount: number }> {
    // Default output directory
    const outputDir = dto.outputDir || path.join(process.cwd(), 'exports');

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeQuery = dto.query.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const filename = `twitter-${safeQuery}-${timestamp}.csv`;
    const filePath = path.join(outputDir, filename);

    // CSV headers following data collection schema
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
      'notes',
    ];

    // Map tweets to data collection schema
    const rows = tweets.map((tweet) => {
      const tweetUrl = tweet.author_username
        ? `https://twitter.com/${tweet.author_username}/status/${tweet.id}`
        : `https://twitter.com/i/web/status/${tweet.id}`;

      // Clean tweet text: remove newlines, escape quotes
      const cleanText = tweet.text
        .replace(/[\r\n]+/g, ' ')
        .replace(/"/g, '""')
        .trim();

      const collectionDate = tweet.created_at
        ? new Date(tweet.created_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const notes = `Twitter ID: ${tweet.id}${tweet.lang ? `, Tweet Lang: ${tweet.lang}` : ''}`;

      return [
        dto.targetLanguage || 'hausa',
        Script.LATIN,
        'Nigeria',
        '',
        SourceType.WEB_PUBLIC,
        tweetUrl,
        collectionDate,
        `"${cleanText}"`,
        Domain.MEDIA_AND_ONLINE,
        dto.query || '',
        Theme.PUBLIC_INTEREST,
        '',
        SafetyFlag.SAFE,
        dto.removePii ? 'true' : 'false',
        `"${notes}"`,
      ];
    });

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    // Write to file
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    this.logger.log(`Saved ${tweets.length} tweets to ${filePath}`);

    return {
      path: filePath,
      filename,
      rowCount: tweets.length,
    };
  }

  /**
   * Export tweets to CSV following the data collection schema
   * Optionally filters by language and removes PII (usernames, emails, etc.)
   */
  async exportTweetsToCsv(dto: ExportTweetsToCsvDto): Promise<{
    success: boolean;
    csvContent: string;
    filename: string;
    totalTweets: number;
    filteredCount?: number;
    nextToken?: string;
  }> {
    // First, search for tweets
    const searchResult = await this.searchTweets(dto);

    if (!searchResult.success || searchResult.tweets.length === 0) {
      return {
        success: false,
        csvContent: '',
        filename: '',
        totalTweets: 0,
        nextToken: searchResult.nextToken,
      };
    }

    let processedTweets = searchResult.tweets;
    let filteredCount = 0;

    // Process tweets for language validation and PII removal if enabled
    if (dto.filterByLanguage || dto.removePii) {
      const targetLanguage = dto.defaultLanguage || 'hausa';
      const minConfidence = dto.minLanguageConfidence || 0.7;

      this.logger.log(
        `Processing ${processedTweets.length} tweets - Filter: ${dto.filterByLanguage}, AI: ${dto.useAiValidation}, RemovePII: ${dto.removePii}`,
      );

      // Process each tweet
      const processedResults = await Promise.all(
        processedTweets.map(async (tweet) => {
          let text = tweet.text;
          let isValidLanguage = true;

          // Remove PII if enabled
          if (dto.removePii) {
            const piiResult = this.textProcessingService.removePii(text);
            text = piiResult.cleanedText;
          }

          // Validate language if enabled
          if (dto.filterByLanguage) {
            if (dto.useAiValidation) {
              // Use AI validation (Claude Haiku)
              const validationResult =
                await this.textProcessingService.validateLanguageWithAI(
                  text,
                  targetLanguage,
                );
              isValidLanguage =
                validationResult.isTargetLanguage &&
                validationResult.confidence >= minConfidence;
            } else {
              // Use local detection (franc) - check if detected language matches Hausa (ISO 639-3: hau)
              const detectionResult =
                await this.textProcessingService.detectLanguageLocal(text);
              // Hausa is 'hau' in ISO 639-3
              const isHausa = detectionResult.language === 'hau';
              isValidLanguage =
                isHausa && detectionResult.confidence >= minConfidence;
            }
          }

          return {
            tweet: { ...tweet, text },
            isValidLanguage,
          };
        }),
      );

      // Filter out tweets that don't match the target language
      if (dto.filterByLanguage) {
        const beforeCount = processedResults.length;
        processedTweets = processedResults
          .filter((r) => r.isValidLanguage)
          .map((r) => r.tweet);
        filteredCount = beforeCount - processedTweets.length;
        this.logger.log(
          `Language filter: kept ${processedTweets.length}, filtered out ${filteredCount}`,
        );
      } else {
        processedTweets = processedResults.map((r) => r.tweet);
      }
    }

    if (processedTweets.length === 0) {
      return {
        success: false,
        csvContent: '',
        filename: '',
        totalTweets: searchResult.tweets.length,
        filteredCount,
        nextToken: searchResult.nextToken,
      };
    }

    // CSV headers following data collection schema
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
      'notes',
    ];

    // Map tweets to data collection schema
    const rows = processedTweets.map((tweet) => {
      const tweetUrl = tweet.author_username
        ? `https://twitter.com/${tweet.author_username}/status/${tweet.id}`
        : `https://twitter.com/i/web/status/${tweet.id}`;

      // Clean tweet text: remove newlines, escape quotes
      const cleanText = tweet.text
        .replace(/[\r\n]+/g, ' ')
        .replace(/"/g, '""')
        .trim();

      const collectionDate = tweet.created_at
        ? new Date(tweet.created_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const notes = `Twitter ID: ${tweet.id}${tweet.lang ? `, Tweet Lang: ${tweet.lang}` : ''}`;

      return [
        dto.defaultLanguage || 'hausa',
        dto.defaultScript || Script.LATIN,
        dto.defaultCountry || 'Nigeria',
        dto.defaultRegionDialect || '',
        SourceType.WEB_PUBLIC,
        tweetUrl,
        collectionDate,
        `"${cleanText}"`,
        dto.defaultDomain || Domain.MEDIA_AND_ONLINE,
        dto.defaultTopic || dto.query || '',
        dto.defaultTheme || Theme.PUBLIC_INTEREST,
        dto.defaultSensitiveCharacteristic || '',
        dto.defaultSafetyFlag || SafetyFlag.SAFE,
        dto.removePii ? 'true' : 'false',
        `"${notes}"`,
      ];
    });

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename =
      dto.filename || `twitter-export-${dto.query}-${timestamp}.csv`;

    return {
      success: true,
      csvContent,
      filename,
      totalTweets: processedTweets.length,
      filteredCount,
      nextToken: searchResult.nextToken,
    };
  }
}
