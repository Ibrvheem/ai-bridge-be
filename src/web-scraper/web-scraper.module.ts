import { Module } from '@nestjs/common';
import { WebScraperController } from './web-scraper.controller';
import { TwitterScraperService } from './twitter-scraper.service';
import { HausaTweetCollectorService } from './hausa-collector.service';
import { AlaroyeScraperService } from './alaroye-scraper.service';
import { BBCYorubaScraperService } from './bbc-yoruba-scraper.service';

@Module({
  controllers: [WebScraperController],
  providers: [
    TwitterScraperService,
    HausaTweetCollectorService,
    AlaroyeScraperService,
    BBCYorubaScraperService,
  ],
  exports: [HausaTweetCollectorService, AlaroyeScraperService, BBCYorubaScraperService],
})
export class WebScraperModule {}
