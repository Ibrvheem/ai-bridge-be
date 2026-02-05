import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SentencesService } from './sentences.service';
import { SentencesController } from './sentences.controller';
import { Sentences } from './sentences.schema';
import { DocumentUpload } from './document-upload.schema';
import { AnnotationExport } from './annotation-export.schema';
import { CsvParserService } from '../lib/csv-parser.service';
import { DuplicateDetectionService } from '../lib/duplicate-detection.service';
import { DocumentTrackingService } from '../lib/document-tracking.service';
import { UploadModule } from '../upload/upload.module';
import { LanguageModule } from 'src/language/language.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Sentences', schema: Sentences },
      { name: 'DocumentUpload', schema: DocumentUpload },
      { name: 'AnnotationExport', schema: AnnotationExport },
    ]),
    UploadModule,
    LanguageModule,
  ],
  controllers: [SentencesController],
  providers: [
    SentencesService,
    CsvParserService,
    DuplicateDetectionService,
    DocumentTrackingService,
  ],
  exports: [
    SentencesService,
    CsvParserService,
    DuplicateDetectionService,
    DocumentTrackingService,
  ],
})
export class SentencesModule {}
