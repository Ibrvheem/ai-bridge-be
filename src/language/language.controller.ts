import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { LanguageService } from './language.service';

import { Public } from 'decorators/public.decorator';
import { CreateLanguageDto } from './dto/create-language.dto';

@Public()
@Controller('language')
export class LanguageController {
  constructor(private readonly languageService: LanguageService) { }

  @Post()
  create(@Body() createLanguageDto: CreateLanguageDto) {
    return this.languageService.create(createLanguageDto);
  }
  @Get()
  getMany() {
    return this.languageService.getMany();
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.languageService.remove(id);
  }
}
