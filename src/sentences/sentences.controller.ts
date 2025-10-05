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
import { UploadService } from '../upload/upload.service';
import { User } from 'decorators/user.decorator';
import { randomUUID } from 'crypto';
import { Public } from 'decorators/public.decorator';


@Controller('sentences')
export class SentencesController {
  constructor(
    private readonly sentencesService: SentencesService,
    private readonly csvParserService: CsvParserService,
    private readonly uploadService: UploadService,
  ) { }

  @Get('csv-template')
  downloadCsvTemplate(@Res() res: Response) {
    const csvContent = 'sentence,original_content,bias_category,language\n"This is a sample sentence.","Original content here","gender","en"\n"Another example sentence.","More original content","racial","en"\n"Third example.","Original text","age","es"';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sentences-template.csv"');
    res.send(csvContent);
  }

  @Post()
  create(@Body() createSentenceDto: CreateSentenceDto) {
    return this.sentencesService.create(createSentenceDto);
  }

  @Post('bulk')
  bulkCreate(@Body() bulkCreateSentenceDto: BulkCreateSentenceDto) {
    return this.sentencesService.bulkCreate(bulkCreateSentenceDto);
  }
  @Post('upload-csv')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @User() user,
    @UploadedFile() file: Express.Multer.File,
    @Body('language') language: string,
  ) {
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

    if (!language) {
      throw new BadRequestException('Language field is required');
    }

    try {
      // Generate unique document ID for this upload
      const documentId = randomUUID();

      // 1. Parse the CSV/XLSX file
      const sentences = await this.csvParserService.parseFile(
        file.buffer,
        file.originalname,
        documentId,
      );
      console.log(sentences)

      if (sentences.length === 0) {
        throw new BadRequestException('No valid sentences found in the uploaded file');
      }

      // 2. Upload file to S3
      const filePath = `csv-uploads/${language}/${user.userId}/${documentId}-${file.originalname}`;
      const uploadResult = await this.uploadService.upload({
        filePath,
        file: file.buffer,
      });


      const bulkResult = await this.sentencesService.bulkCreate({
        sentences,
        document_id: documentId,
        language,
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
          totalSentences: sentences.length,
          insertedCount: bulkResult.insertedCount,
          success: bulkResult.success,
          errors: bulkResult.errors || [],
        },
      };
    } catch (error) {
      throw new BadRequestException(`Failed to process file: ${error.message}`);
    }
  }

  @Get()
  findAll() {
    return this.sentencesService.findAll();
  }

  @Get('by-category/:category')
  findByBiasCategory(@Param('category') category: string) {
    return this.sentencesService.findByBiasCategory(category);
  }

  @Get('by-language/:language')
  findByLanguage(@Param('language') language: string) {
    return this.sentencesService.findByLanguage(language);
  }

  @Get('by-document/:documentId')
  findByDocumentId(@Param('documentId') documentId: string) {
    return this.sentencesService.findByDocumentId(documentId);
  }

  @Get('documents')
  getDocumentIds() {
    return this.sentencesService.getDocumentIds();
  }

  @Get('documents/stats')
  getDocumentStats() {
    return this.sentencesService.getDocumentStats();
  }

  @Delete('documents/:documentId')
  deleteByDocumentId(@Param('documentId') documentId: string) {
    return this.sentencesService.deleteByDocumentId(documentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sentencesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSentenceDto: UpdateSentenceDto) {
    return this.sentencesService.update(id, updateSentenceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sentencesService.remove(id);
  }
}
