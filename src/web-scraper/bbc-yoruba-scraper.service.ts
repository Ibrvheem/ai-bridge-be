import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import {
  TextProcessingService,
  HausaTextAnalysis,
} from '../lib/text-processing.service';

export interface BBCYorubaArticle {
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
export class BBCYorubaScraperService {
  private readonly logger = new Logger(BBCYorubaScraperService.name);
  private readonly httpClient: AxiosInstance;
  private readonly textProcessingService: TextProcessingService;
  private readonly baseUrl = 'https://www.bbc.com';
  private readonly yorubaPath = '/yoruba';
  private readonly outputDir = path.join(process.cwd(), 'exports');
  private isRunning = false;

  // BBC Yoruba topic categories
  private readonly categories = [
    { name: 'Nigeria', path: '/yoruba/topics/c2dwqd1zr92t' },
    { name: 'Africa', path: '/yoruba/topics/c404v027pd4t' },
    { name: 'World', path: '/yoruba/topics/cez0z0ryzkrt' },
    { name: 'Entertainment', path: '/yoruba/topics/cvjp2j1qn1jt' },
    { name: 'Sports', path: '/yoruba/topics/cezp2jlx2zpt' },
  ];

  constructor() {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'yo,en-US;q=0.9,en;q=0.8',
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
  getStatus(): {
    isRunning: boolean;
    categories: { name: string; path: string }[];
  } {
    return {
      isRunning: this.isRunning,
      categories: this.categories,
    };
  }

  /**
   * Scrape articles from BBC Yoruba
   * Collects Yoruba language sentences from news articles
   */
  async scrapeArticles(options?: {
    maxArticles?: number;
    useAiAnalysis?: boolean;
    categoryName?: string;
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
    const maxArticles = options?.maxArticles || 20;
    const useAiAnalysis = options?.useAiAnalysis ?? true;
    const categoryName = options?.categoryName;

    try {
      this.logger.log(
        `Starting BBC Yoruba scraper - Max articles: ${maxArticles}, Category: ${categoryName || 'all'}`,
      );

      // Step 1: Collect article URLs
      const articleUrls = await this.collectArticleUrls(
        maxArticles,
        categoryName,
      );
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

      for (const urlInfo of articleUrls) {
        try {
          const article = await this.scrapeArticle(
            urlInfo.url,
            urlInfo.category,
          );
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
          // Rate limiting - wait 1.5 seconds between requests (BBC may be stricter)
          await this.sleep(1500);
        } catch (error) {
          this.logger.warn(
            `Failed to scrape article: ${urlInfo.url}`,
            error.message,
          );
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
            if (analysis && analysis.isCompleteSentence && analysis.isHausa) {
              processedSentences.push({
                ...sentence,
                analysis,
              });
            } else {
              rejectedCount++;
              this.logger.debug(
                `Rejected: "${sentence.text.substring(0, 50)}..." - Reason: ${analysis?.reasoning || 'unknown'}`,
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
        message: `Successfully scraped ${processedSentences.length} Yoruba sentences from ${articleUrls.length} BBC articles`,
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
   * Collect article URLs from BBC Yoruba
   */
  private async collectArticleUrls(
    maxArticles: number,
    categoryName?: string,
  ): Promise<{ url: string; category: string }[]> {
    const articleUrls: Map<string, string> = new Map();

    // Determine which categories to scrape
    const categoriesToScrape = categoryName
      ? this.categories.filter(
          (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
        )
      : this.categories;

    if (categoriesToScrape.length === 0) {
      this.logger.warn(
        `Category "${categoryName}" not found, scraping all categories`,
      );
      categoriesToScrape.push(...this.categories);
    }

    // Also scrape the main Yoruba page
    try {
      this.logger.log(`Fetching main page: ${this.baseUrl}${this.yorubaPath}`);
      const response = await this.httpClient.get(this.yorubaPath);
      const $ = cheerio.load(response.data);

      this.extractArticleLinks($, articleUrls, 'General');
      await this.sleep(1000);
    } catch (error) {
      this.logger.warn(`Failed to fetch main page: ${error.message}`);
    }

    // Scrape each category
    for (const category of categoriesToScrape) {
      if (articleUrls.size >= maxArticles) break;

      try {
        this.logger.log(
          `Fetching category ${category.name}: ${this.baseUrl}${category.path}`,
        );
        const response = await this.httpClient.get(category.path);
        const $ = cheerio.load(response.data);

        this.extractArticleLinks($, articleUrls, category.name);
        await this.sleep(1000);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch category ${category.name}: ${error.message}`,
        );
      }
    }

    return Array.from(articleUrls.entries())
      .slice(0, maxArticles)
      .map(([url, category]) => ({ url, category }));
  }

  /**
   * Extract article links from a page
   */
  private extractArticleLinks(
    $: cheerio.CheerioAPI,
    articleUrls: Map<string, string>,
    category: string,
  ): void {
    // BBC uses various selectors for article links
    const selectors = [
      'a[href*="/yoruba/articles/"]',
      'a[href*="/yoruba/"]',
      '.bbc-wr82hg a', // BBC promo cards
      '[data-testid="anchor-inner-wrapper"]',
      'article a',
      '.media__link',
      '.gs-c-promo-heading a',
    ];

    for (const selector of selectors) {
      $(selector).each((_, element) => {
        const href = $(element).attr('href');
        if (href && this.isValidArticleUrl(href)) {
          const fullUrl = href.startsWith('http')
            ? href
            : `${this.baseUrl}${href}`;
          if (!articleUrls.has(fullUrl)) {
            articleUrls.set(fullUrl, category);
          }
        }
      });
    }
  }

  /**
   * Check if URL is a valid BBC Yoruba article URL
   */
  private isValidArticleUrl(href: string): boolean {
    // BBC Yoruba article URLs typically contain /yoruba/ and have article-like patterns
    if (!href.includes('/yoruba/')) return false;

    // Skip topic/category pages
    if (href.includes('/topics/')) return false;

    // Skip video/media pages
    if (href.includes('/media/')) return false;

    // Should have some path after /yoruba/
    const yorubaIndex = href.indexOf('/yoruba/');
    const afterYoruba = href.substring(yorubaIndex + 8);

    // Articles typically have a longer path or contain "articles"
    return afterYoruba.length > 5 || href.includes('/articles/');
  }

  /**
   * Scrape a single article and extract sentences
   */
  private async scrapeArticle(
    url: string,
    category: string,
  ): Promise<BBCYorubaArticle | null> {
    try {
      this.logger.debug(`Scraping article: ${url}`);

      const response = await this.httpClient.get(url);
      const $ = cheerio.load(response.data);

      // Extract title
      const title =
        $('h1').first().text().trim() ||
        $('[data-testid="headline"]').text().trim() ||
        $('title').text().split(' - ')[0].trim() ||
        'Unknown Title';

      // Extract date
      let date = new Date().toISOString().split('T')[0];
      const timeElement = $('time').first();
      if (timeElement.length) {
        const datetime = timeElement.attr('datetime');
        if (datetime) {
          date = datetime.split('T')[0];
        }
      }

      // Extract article content
      let content = '';

      // BBC uses various content containers
      const contentSelectors = [
        '[data-component="text-block"]',
        '.bbc-19j92fr', // BBC text paragraphs
        'article p',
        '.story-body p',
        '.article__body-content p',
        '[role="main"] p',
      ];

      for (const selector of contentSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          elements.each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 20) {
              content += text + ' ';
            }
          });
          if (content.trim().length > 100) break;
        }
      }

      // Fallback: get all paragraphs from main content area
      if (content.trim().length < 100) {
        $('main p, article p').each((_, el) => {
          const text = $(el).text().trim();
          // Skip navigation, footer, and short paragraphs
          if (
            text.length > 20 &&
            !text.includes('©') &&
            !text.includes('BBC') &&
            !text.toLowerCase().includes('copyright')
          ) {
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
    const filename = `yoruba-bbc-${timestamp}.csv`;
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
