import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import {
  TextProcessingService,
  HausaTextAnalysis,
} from '../lib/text-processing.service';

export interface AlaroyeArticle {
  title: string;
  url: string;
  content: string;
  cleanedContent: string;
  date: string;
  category: string;
  sentences: string[];
  analysis?: HausaTextAnalysis | null;
}

export interface ScrapedSentence {
  text: string;
  sourceUrl: string;
  sourceTitle: string;
  date: string;
  category: string;
  analysis?: HausaTextAnalysis | null;
}

@Injectable()
export class AlaroyeScraperService {
  private readonly logger = new Logger(AlaroyeScraperService.name);
  private readonly httpClient: AxiosInstance;
  private readonly textProcessingService: TextProcessingService;
  private readonly baseUrl = 'https://alaroye.org';
  private readonly outputDir = path.join(process.cwd(), 'exports');
  private isRunning = false;

  constructor() {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.textProcessingService = new TextProcessingService();
  }

  /**
   * Get the current scraping status
   */
  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }

  /**
   * Scrape articles from Alaroye.org
   * Collects Yoruba language sentences from news articles
   */
  async scrapeArticles(options?: {
    maxPages?: number;
    maxArticles?: number;
    useAiAnalysis?: boolean;
    category?: string;
  }): Promise<{
    success: boolean;
    totalArticles: number;
    totalSentences: number;
    totalAnalyzed: number;
    savedSentences: number;
    rejectedSentences: number;
    filePath: string;
    message: string;
  }> {
    if (this.isRunning) {
      return {
        success: false,
        totalArticles: 0,
        totalSentences: 0,
        totalAnalyzed: 0,
        savedSentences: 0,
        rejectedSentences: 0,
        filePath: '',
        message: 'Scraper is already running',
      };
    }

    this.isRunning = true;
    const maxPages = options?.maxPages || 3;
    const maxArticles = options?.maxArticles || 20;
    const useAiAnalysis = options?.useAiAnalysis ?? true;

    try {
      this.logger.log(
        `Starting Alaroye scraper - Max pages: ${maxPages}, Max articles: ${maxArticles}`,
      );

      // Step 1: Collect article URLs from listing pages
      const articleUrls = await this.collectArticleUrls(maxPages, maxArticles);
      this.logger.log(`Found ${articleUrls.length} article URLs`);

      if (articleUrls.length === 0) {
        return {
          success: false,
          totalArticles: 0,
          totalSentences: 0,
          totalAnalyzed: 0,
          savedSentences: 0,
          rejectedSentences: 0,
          filePath: '',
          message: 'No articles found',
        };
      }

      // Step 2: Scrape each article and extract sentences
      const allSentences: ScrapedSentence[] = [];

      for (const url of articleUrls) {
        try {
          const article = await this.scrapeArticle(url);
          if (article && article.sentences.length > 0) {
            for (const sentence of article.sentences) {
              allSentences.push({
                text: sentence,
                sourceUrl: article.url,
                sourceTitle: article.title,
                date: article.date,
                category: article.category,
              });
            }
          }
          // Rate limiting - wait 1 second between requests
          await this.sleep(1000);
        } catch (error) {
          this.logger.warn(`Failed to scrape article: ${url}`, error.message);
        }
      }

      this.logger.log(`Extracted ${allSentences.length} sentences`);

      // Step 3: AI Analysis (if enabled) - filter for complete sentences
      let processedSentences: ScrapedSentence[] = [];
      let rejectedCount = 0;

      if (useAiAnalysis && allSentences.length > 0) {
        this.logger.log('Running AI analysis on sentences...');

        for (let i = 0; i < allSentences.length; i++) {
          const sentence = allSentences[i];

          try {
            // Use AI to analyze if it's a complete Yoruba sentence
            const analysis = await this.textProcessingService.analyzeYorubaText(
              sentence.text,
            );

            // Note: analyzeYorubaText maps isYoruba to the isHausa field in the interface
            if (analysis.isCompleteSentence && analysis.isHausa) {
              processedSentences.push({
                ...sentence,
                analysis,
              });
            } else {
              rejectedCount++;
              this.logger.debug(
                `Rejected: "${sentence.text.substring(0, 50)}..." - Reason: ${analysis.reasoning}`,
              );
            }

            // Log progress every 10 sentences
            if ((i + 1) % 10 === 0) {
              this.logger.log(
                `Analyzed ${i + 1}/${allSentences.length} sentences`,
              );
            }

            // Rate limit AI calls
            await this.sleep(200);
          } catch (error) {
            this.logger.warn(
              `AI analysis failed for sentence: ${error.message}`,
            );
            // Keep sentence without analysis if AI fails
            processedSentences.push(sentence);
          }
        }
      } else {
        processedSentences = allSentences;
      }

      // Step 4: Save to CSV
      const filePath = await this.saveToCsv(processedSentences);

      return {
        success: true,
        totalArticles: articleUrls.length,
        totalSentences: allSentences.length,
        totalAnalyzed: useAiAnalysis ? allSentences.length : 0,
        savedSentences: processedSentences.length,
        rejectedSentences: rejectedCount,
        filePath,
        message: `Successfully scraped ${processedSentences.length} Yoruba sentences from ${articleUrls.length} articles`,
      };
    } catch (error) {
      this.logger.error('Scraping failed:', error);
      return {
        success: false,
        totalArticles: 0,
        totalSentences: 0,
        totalAnalyzed: 0,
        savedSentences: 0,
        rejectedSentences: 0,
        filePath: '',
        message: `Scraping failed: ${error.message}`,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Collect article URLs from listing pages
   */
  private async collectArticleUrls(
    maxPages: number,
    maxArticles: number,
  ): Promise<string[]> {
    const articleUrls: Set<string> = new Set();

    for (let page = 1; page <= maxPages; page++) {
      if (articleUrls.size >= maxArticles) break;

      try {
        const url = page === 1 ? '/' : `/page/${page}/`;
        this.logger.log(`Fetching page ${page}: ${this.baseUrl}${url}`);

        const response = await this.httpClient.get(url);
        const $ = cheerio.load(response.data);

        // Find article links - WordPress typically uses article tags or specific classes
        $('article a, .post a, h2 a, h3 a').each((_, element) => {
          const href = $(element).attr('href');
          if (
            href &&
            href.includes('alaroye.org') &&
            href.match(/\/\d{4}\/\d{2}\/\d{2}\//)
          ) {
            articleUrls.add(href);
          }
        });

        // Also try to find links with date pattern in URL
        $('a[href*="/202"]').each((_, element) => {
          const href = $(element).attr('href');
          if (href && href.match(/alaroye\.org\/\d{4}\/\d{2}\/\d{2}\//)) {
            articleUrls.add(href);
          }
        });

        await this.sleep(1000);
      } catch (error) {
        this.logger.warn(`Failed to fetch page ${page}: ${error.message}`);
      }
    }

    return Array.from(articleUrls).slice(0, maxArticles);
  }

  /**
   * Scrape a single article and extract sentences
   */
  private async scrapeArticle(url: string): Promise<AlaroyeArticle | null> {
    try {
      this.logger.debug(`Scraping article: ${url}`);

      const response = await this.httpClient.get(url);
      const $ = cheerio.load(response.data);

      // Extract title
      const title =
        $('h1.entry-title, h1.post-title, article h1, .post h1')
          .first()
          .text()
          .trim() ||
        $('title').text().split('|')[0].trim() ||
        'Unknown Title';

      // Extract date from URL or meta
      let date = new Date().toISOString().split('T')[0];
      const dateMatch = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (dateMatch) {
        date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      }

      // Extract category
      const category =
        $('a[rel="category tag"], .category a, .post-category')
          .first()
          .text()
          .trim() || 'General';

      // Extract article content
      let content = '';

      // Try different content selectors
      const contentSelectors = [
        '.entry-content',
        '.post-content',
        'article .content',
        '.article-content',
        'article p',
        '.post p',
      ];

      for (const selector of contentSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          elements.each((_, el) => {
            content += $(el).text() + ' ';
          });
          if (content.trim().length > 100) break;
        }
      }

      // Fallback: get all paragraphs
      if (content.trim().length < 100) {
        $('p').each((_, el) => {
          const text = $(el).text().trim();
          // Skip navigation, footer, and short paragraphs
          if (text.length > 20 && !text.includes('©') && !text.includes('|')) {
            content += text + ' ';
          }
        });
      }

      // Clean the content
      const cleanedContent = this.cleanText(content);

      if (cleanedContent.length < 50) {
        this.logger.debug(`Article has insufficient content: ${url}`);
        return null;
      }

      // Split into sentences
      const sentences = this.splitIntoSentences(cleanedContent);

      this.logger.debug(
        `Extracted ${sentences.length} sentences from: ${title}`,
      );

      return {
        title,
        url,
        content,
        cleanedContent,
        date,
        category,
        sentences,
      };
    } catch (error) {
      this.logger.warn(`Failed to scrape article ${url}: ${error.message}`);
      return null;
    }
  }

  /**
   * Clean text: remove extra whitespace, emojis, special characters
   */
  private cleanText(text: string): string {
    return (
      text
        // Remove emojis
        .replace(
          /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
          '',
        )
        // Remove URLs
        .replace(/https?:\/\/\S+/g, '')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        // Remove special characters but keep Yoruba diacritics
        .replace(/[^\w\s.,!?;:'"àáèéìíòóùúẹọṣ̀́ÀÁÈÉÌÍÒÓÙÚẸỌṢñÑ-]/gi, '')
        .trim()
    );
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence-ending punctuation
    const rawSentences = text.split(/(?<=[.!?])\s+/);

    return rawSentences
      .map((s) => s.trim())
      .filter((s) => {
        // Must be at least 20 characters
        if (s.length < 20) return false;
        // Must have at least 3 words
        const wordCount = s.split(/\s+/).length;
        if (wordCount < 3) return false;
        // Must end with punctuation or be substantial
        if (s.length > 30 || /[.!?]$/.test(s)) return true;
        return false;
      });
  }

  /**
   * Save scraped sentences to CSV following DataCollection schema
   */
  private async saveToCsv(sentences: ScrapedSentence[]): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `yoruba-alaroye-${timestamp}.csv`;
    const filePath = path.join(this.outputDir, filename);

    // DataCollection schema headers
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

    const rows = sentences.map((sentence) => {
      const cleanText = sentence.text.replace(/"/g, '""');
      const analysis = sentence.analysis;

      return [
        'yoruba',
        'latin',
        'Nigeria',
        analysis?.regionDialect || '',
        'web_public',
        sentence.sourceUrl,
        sentence.date,
        `"${cleanText}"`,
        analysis?.domain || 'media_and_online',
        analysis?.topic || sentence.category || 'news',
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
    this.logger.log(`Saved ${sentences.length} sentences to ${filePath}`);

    return filePath;
  }

  /**
   * Sleep helper for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
