import { Controller, Get, Query } from '@nestjs/common';
import { HausaTweetCollectorService } from './hausa-collector.service';
import { AlaroyeScraperService } from './alaroye-scraper.service';
import { BBCYorubaScraperService } from './bbc-yoruba-scraper.service';
import { Public } from 'decorators/public.decorator';

@Controller('web-scraper')
@Public()
export class WebScraperController {
  constructor(
    private readonly hausaCollectorService: HausaTweetCollectorService,
    private readonly alaroyeScraperService: AlaroyeScraperService,
    private readonly bbcYorubaScraperService: BBCYorubaScraperService,
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
}
