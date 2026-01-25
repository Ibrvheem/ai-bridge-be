import { Controller } from '@nestjs/common';
import { WebScraperService } from './web-scraper.service';

@Controller('web-scraper')
export class WebScraperController {
  constructor(private readonly webScraperService: WebScraperService) {}
}
