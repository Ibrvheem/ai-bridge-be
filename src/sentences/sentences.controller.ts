import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SentencesService } from './sentences.service';
import { CreateSentenceDto } from './dto/create-sentence.dto';
import { UpdateSentenceDto } from './dto/update-sentence.dto';
import { BulkCreateSentenceDto } from './dto/bulk-create-sentence.dto';
import { CsvParserService } from '../lib/csv-parser.service';
import { DuplicateDetectionService } from '../lib/duplicate-detection.service';
import { DocumentTrackingService } from '../lib/document-tracking.service';
import { UploadService } from '../upload/upload.service';
import { User } from 'decorators/user.decorator';
import { randomUUID } from 'crypto';
import { Public } from 'decorators/public.decorator';
import { AnnotateSentenceDto } from './dto/annotate-sentences.dto';

@Controller('sentences')
export class SentencesController {
  constructor(
    private readonly sentencesService: SentencesService,
    private readonly csvParserService: CsvParserService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly documentTrackingService: DocumentTrackingService,
    private readonly uploadService: UploadService,
  ) {}

  @Get('csv-template')
  downloadCsvTemplate(@Res() res: Response) {
    const csvContent = `language,script,country,region_dialect,source_type,source_ref,collection_date,text,domain,topic,theme,sensitive_characteristic,safety_flag,pii_removed,notes
hausa,latin,Nigeria,standard_hausa,media,https://example.com/source,2026-01-25T09:00:00.000Z,"Sample text in Hausa language here.",media_and_online,news_reporting,public_interest,,safe,true,Sample note
hausa,latin,Nigeria,kano_dialect,community,,2026-01-25T09:00:00.000Z,"Another sample sentence.",culture_and_religion,religious_content,stereotypes,gender,safe,true,`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="data-collection-template.csv"',
    );
    res.send(csvContent);
  }

  @Post()
  create(@Body() createSentenceDto: CreateSentenceDto, @User() user) {
    return this.sentencesService.create(createSentenceDto, user.userId);
  }

  @Post('bulk')
  bulkCreate(
    @Body() bulkCreateSentenceDto: BulkCreateSentenceDto,
    @User() user,
  ) {
    return this.sentencesService.bulkCreate(bulkCreateSentenceDto, user.userId);
  }
  @Post('upload-csv')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(@User() user, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only CSV and Excel files are allowed');
    }

    const startTime = Date.now();
    const documentId = randomUUID();

    try {
      // 1. Parse the CSV/XLSX file
      const parsedSentences = await this.csvParserService.parseFile(
        file.buffer,
        file.originalname,
      );

      if (parsedSentences.length === 0) {
        throw new BadRequestException(
          'No valid sentences found in the uploaded file',
        );
      }

      // 2. Upload file to S3
      const filePath = `${user.userId}/csv-uploads/${documentId}-${file.originalname}`;
      const uploadResult = await this.uploadService.upload({
        filePath,
        file: file.buffer,
      });

      // 3. Create document tracking record
      await this.documentTrackingService.createDocumentRecord({
        document_id: documentId,
        user_id: user.userId,
        original_filename: file.originalname,
        s3_key: uploadResult.key,
        file_size: file.size,
        mime_type: file.mimetype,
        total_rows: parsedSentences.length,
      });

      // 4. Process sentences with duplicate detection
      const processingResult =
        await this.duplicateDetectionService.processSentencesWithDuplicateCheck(
          parsedSentences,
          documentId,
        );

      // 5. Insert valid (non-duplicate) sentences
      let bulkResult: {
        success: boolean;
        insertedCount: number;
        errors: any[];
        document_id?: string;
      } = {
        success: true,
        insertedCount: 0,
        errors: [],
      };

      if (processingResult.validSentences.length > 0) {
        const result = await this.sentencesService.bulkCreate(
          {
            sentences: processingResult.validSentences,
            document_id: documentId,
            // No default language - will be set during annotation
          },
          user.userId,
        );

        bulkResult = {
          success: result.success,
          insertedCount: result.insertedCount,
          errors: result.errors || [],
          document_id: result.document_id,
        };
      }

      // 6. Calculate processing time
      const processingTimeMs = Date.now() - startTime;

      // 7. Update document tracking record with results
      await this.documentTrackingService.updateDocumentRecord(documentId, {
        successful_inserts: bulkResult.insertedCount,
        failed_inserts:
          processingResult.errors.length + (bulkResult.errors?.length || 0),
        duplicate_count: processingResult.duplicates.length,
        duplicates: processingResult.duplicates,
        errors: [
          ...processingResult.errors,
          ...(bulkResult.errors || []).map((err) => ({
            row_number: err.index + 1, // Use the actual index from MongoDB error
            error: err.error || 'Database insertion error',
          })),
        ],
        processing_time_ms: processingTimeMs,
        status: 'completed',
      });

      return {
        message: 'File processed successfully',
        document_id: documentId,
        file: {
          originalName: file.originalname,
          s3Key: uploadResult.key,
          uploadSuccess: uploadResult.success,
        },
        processing: {
          totalRows: parsedSentences.length,
          successfulInserts: bulkResult.insertedCount,
          duplicatesFound: processingResult.duplicates.length,
          errorsFound:
            processingResult.errors.length + (bulkResult.errors?.length || 0),
          processingTimeMs,
          success: bulkResult.success,
        },
        duplicates: processingResult.duplicates,
        // No need to map as the structure already matches
        errors: processingResult.errors,
      };
    } catch (error) {
      // Update document tracking record with failure
      await this.documentTrackingService.updateDocumentRecord(documentId, {
        successful_inserts: 0,
        failed_inserts: 0,
        duplicate_count: 0,
        processing_time_ms: Date.now() - startTime,
        status: 'failed',
        errors: [
          {
            row_number: 0,
            error: error.message || 'Processing failed',
          },
        ],
      });

      throw new BadRequestException(`Failed to process file: ${error.message}`);
    }
  }

  @Get('unannotated')
  getAllUnannotatedSentences() {
    return this.sentencesService.getAllUnannotatedSentences();
  }

  @Get('annotated')
  getAllAnnotatedSentences() {
    return this.sentencesService.getAllAnnotatedSentences();
  }

  @Get('by-language/:language')
  findByLanguage(@Param('language') language: string) {
    return this.sentencesService.findByLanguage(language);
  }

  @Get('by-country/:country')
  findByCountry(@Param('country') country: string) {
    return this.sentencesService.findByCountry(country);
  }

  @Get('by-source-type/:sourceType')
  findBySourceType(@Param('sourceType') sourceType: string) {
    return this.sentencesService.findBySourceType(sourceType as any);
  }

  @Get('by-bias-label/:biasLabel')
  findByBiasLabel(@Param('biasLabel') biasLabel: string) {
    return this.sentencesService.findByBiasLabel(biasLabel as any);
  }

  @Get('by-domain/:domain')
  findByDomain(@Param('domain') domain: string) {
    return this.sentencesService.findByDomain(domain as any);
  }

  @Get('by-theme/:theme')
  findByTheme(@Param('theme') theme: string) {
    return this.sentencesService.findByTheme(theme as any);
  }

  @Get('by-safety-flag/:safetyFlag')
  findBySafetyFlag(@Param('safetyFlag') safetyFlag: string) {
    return this.sentencesService.findBySafetyFlag(safetyFlag as any);
  }

  @Get('by-qa-status/:qaStatus')
  findByQAStatus(@Param('qaStatus') qaStatus: string) {
    return this.sentencesService.findByQAStatus(qaStatus as any);
  }

  @Get('categories')
  getCategories() {
    return this.sentencesService.getCategories();
  }

  @Get('stats')
  getStats() {
    return this.sentencesService.getStats();
  }

  @Get('stats/annotations')
  getAnnotationStats() {
    return this.sentencesService.getAnnotationStats();
  }

  @Get('upload-history')
  getUploadHistory(@User() user) {
    return this.documentTrackingService.getAllDocuments(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sentencesService.findOne(id);
  }

  @Patch('annotate/:id')
  annotateSentence(
    @Param('id') id: string,
    @Body() annotateSentenceDto: AnnotateSentenceDto,
    @User() user,
  ) {
    return this.sentencesService.annotateSentence(
      id,
      user.userId,
      annotateSentenceDto,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateSentenceDto: UpdateSentenceDto,
  ) {
    return this.sentencesService.update(id, updateSentenceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sentencesService.remove(id);
  }
}
