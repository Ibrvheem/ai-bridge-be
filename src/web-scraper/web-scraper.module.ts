import { Module } from '@nestjs/common';
import { WebScraperService } from './web-scraper.service';
import { WebScraperController } from './web-scraper.controller';

@Module({
  controllers: [WebScraperController],
  providers: [WebScraperService],
})
export class WebScraperModule {}
