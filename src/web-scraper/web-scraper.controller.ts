import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HausaTweetCollectorService } from './hausa-collector.service';
import { AlaroyeScraperService } from './alaroye-scraper.service';
import { BBCYorubaScraperService } from './bbc-yoruba-scraper.service';
import { TextFileProcessorService } from './text-file-processor.service';
import { Public } from 'decorators/public.decorator';

@Controller('web-scraper')
@Public()
export class WebScraperController {
  constructor(
    private readonly hausaCollectorService: HausaTweetCollectorService,
    private readonly alaroyeScraperService: AlaroyeScraperService,
    private readonly bbcYorubaScraperService: BBCYorubaScraperService,
    private readonly textFileProcessorService: TextFileProcessorService,
  ) {}

  /**
   * Collect Hausa tweets using predefined keywords
   * Fetches tweets, removes PII, validates language, and saves to CSV
   * Example: GET /web-scraper/collect-hausa
   * Example: GET /web-scraper/collect-hausa?maxResultsPerWord=100
   */
  @Get('collect-hausa')
  async collectHausaTweets(
    @Query('maxResultsPerWord') maxResultsPerWord?: number,
  ) {
    return this.hausaCollectorService.collectHausaTweets({
      maxResultsPerWord: maxResultsPerWord ? Number(maxResultsPerWord) : 50,
    });
  }

  /**
   * Get status and list of Hausa words used for collection
   * Example: GET /web-scraper/collect-hausa/status
   */
  @Get('collect-hausa/status')
  getCollectorStatus() {
    return {
      ...this.hausaCollectorService.getStatus(),
      words: this.hausaCollectorService.getHausaWords(),
    };
  }

  // ===== ALAROYE (YORUBA NEWS) SCRAPER =====

  /**
   * Scrape Yoruba articles from alaroye.org
   * Extracts sentences, validates language with AI, and saves to CSV
   * Example: GET /web-scraper/scrape-alaroye
   * Example: GET /web-scraper/scrape-alaroye?maxPages=5&maxArticles=30
   */
  @Get('scrape-alaroye')
  async scrapeAlaroye(
    @Query('maxPages') maxPages?: number,
    @Query('maxArticles') maxArticles?: number,
    @Query('useAiAnalysis') useAiAnalysis?: string,
  ) {
    return this.alaroyeScraperService.scrapeArticles({
      maxPages: maxPages ? Number(maxPages) : 3,
      maxArticles: maxArticles ? Number(maxArticles) : 20,
      useAiAnalysis: useAiAnalysis !== 'false',
    });
  }

  /**
   * Get Alaroye scraper status
   * Example: GET /web-scraper/scrape-alaroye/status
   */
  @Get('scrape-alaroye/status')
  getAlaroyeScraperStatus() {
    return this.alaroyeScraperService.getStatus();
  }

  // ===== BBC YORUBA SCRAPER =====

  /**
   * Scrape Yoruba articles from BBC Yoruba (bbc.com/yoruba)
   * Extracts sentences, validates language with AI, and saves to CSV
   * Example: GET /web-scraper/scrape-bbc-yoruba
   * Example: GET /web-scraper/scrape-bbc-yoruba?maxArticles=30&category=Nigeria
   */
  @Get('scrape-bbc-yoruba')
  async scrapeBBCYoruba(
    @Query('maxArticles') maxArticles?: number,
    @Query('category') category?: string,
    @Query('useAiAnalysis') useAiAnalysis?: string,
  ) {
    return this.bbcYorubaScraperService.scrapeArticles({
      maxArticles: maxArticles ? Number(maxArticles) : 20,
      categoryName: category,
      useAiAnalysis: useAiAnalysis !== 'false',
    });
  }

  /**
   * Get BBC Yoruba scraper status and available categories
   * Example: GET /web-scraper/scrape-bbc-yoruba/status
   */
  @Get('scrape-bbc-yoruba/status')
  getBBCYorubaScraperStatus() {
    return this.bbcYorubaScraperService.getStatus();
  }

  // ===== TEXT FILE PROCESSOR =====

  /**
   * Upload and process a text file (form-data)
   * Accepts articles or sentence-per-line files — breaks them into sentences,
   * removes PII, runs AI analysis, and structures into DataCollection schema.
   *
   * Form fields:
   *   file        (required) - the text file
   *   language    (required) - e.g. "hausa", "yoruba"
   *   country     (required) - e.g. "Nigeria"
   *   sourceRef   (required) - e.g. "OpenWHO"
   *   sourceType  (optional) - default "web_public"
   *   script      (optional) - default "latin"
   *   collectorId (optional)
   *   useAiAnalysis (optional) - default "true"
   */
  @Post('process-file')
  @UseInterceptors(FileInterceptor('file'))
  async processFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('language') language: string,
    @Body('country') country: string,
    @Body('sourceRef') sourceRef: string,
    @Body('sourceType') sourceType?: string,
    @Body('script') script?: string,
    @Body('collectorId') collectorId?: string,
    @Body('useAiAnalysis') useAiAnalysis?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!language || !country || !sourceRef) {
      throw new BadRequestException(
        'language, country, and sourceRef are required fields',
      );
    }

    return this.textFileProcessorService.processTextFile({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      language,
      country,
      sourceRef,
      sourceType: sourceType || 'web_public',
      script: script || 'latin',
      collectorId,
      useAiAnalysis: useAiAnalysis !== 'false',
    });
  }
}
