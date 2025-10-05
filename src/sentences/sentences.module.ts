import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SentencesService } from './sentences.service';
import { SentencesController } from './sentences.controller';
import { Sentences } from './sentences.schema';
import { CsvParserService } from '../lib/csv-parser.service';
import { UploadModule } from '../upload/upload.module';
import { LanguageModule } from 'src/language/language.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Sentences', schema: Sentences }]),
    UploadModule,
    LanguageModule
  ],
  controllers: [SentencesController],
  providers: [SentencesService, CsvParserService],
  exports: [SentencesService, CsvParserService],
})
export class SentencesModule { }
