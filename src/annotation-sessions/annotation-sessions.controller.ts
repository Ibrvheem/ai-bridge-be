import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { AnnotationSessionsService } from './annotation-sessions.service';
import {
  CreateAnnotationSessionDto,
  UpdateAnnotationSessionDto,
  AddSentenceToSessionDto,
  ExportSessionDto,
  BulkAddSentencesToSessionDto,
} from './dto';
import { User } from 'decorators/user.decorator';

@Controller('annotation-sessions')
export class AnnotationSessionsController {
  constructor(
    private readonly annotationSessionsService: AnnotationSessionsService,
  ) {}

  // Create a new annotation session
  @Post()
  create(@Body() createDto: CreateAnnotationSessionDto, @User() user) {
    return this.annotationSessionsService.create(createDto, user.userId);
  }

  // Get all sessions for the current user
  @Get()
  findAll(@User() user) {
    return this.annotationSessionsService.findAllByUser(user.userId);
  }

  // Get user's session statistics
  @Get('stats')
  getUserStats(@User() user) {
    return this.annotationSessionsService.getUserSessionStats(user.userId);
  }

  // Get a single session
  @Get(':id')
  findOne(@Param('id') id: string, @User() user) {
    return this.annotationSessionsService.findOne(id, user.userId);
  }

  // Get a session with its sentences
  @Get(':id/sentences')
  findOneWithSentences(@Param('id') id: string, @User() user) {
    return this.annotationSessionsService.findOneWithSentences(id, user.userId);
  }

  // Get session statistics
  @Get(':id/stats')
  getSessionStats(@Param('id') id: string, @User() user) {
    return this.annotationSessionsService.getSessionStats(id, user.userId);
  }

  // Get export history for a session
  @Get(':id/exports')
  getExportHistory(@Param('id') id: string, @User() user) {
    return this.annotationSessionsService.getExportHistory(id, user.userId);
  }

  // Update a session
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateAnnotationSessionDto,
    @User() user,
  ) {
    return this.annotationSessionsService.update(id, user.userId, updateDto);
  }

  // Add a sentence to the session
  @Post(':id/sentences')
  addSentence(
    @Param('id') id: string,
    @Body() addDto: AddSentenceToSessionDto,
    @User() user,
  ) {
    return this.annotationSessionsService.addAnnotatedSentence(
      id,
      user.userId,
      addDto.sentence_id,
    );
  }

  // Bulk add sentences to the session
  @Post(':id/sentences/bulk')
  bulkAddSentences(
    @Param('id') id: string,
    @Body() bulkAddDto: BulkAddSentencesToSessionDto,
    @User() user,
  ) {
    const promises = bulkAddDto.sentence_ids.map((sentenceId) =>
      this.annotationSessionsService.addAnnotatedSentence(
        id,
        user.userId,
        sentenceId,
      ),
    );
    return Promise.all(promises);
  }

  // Remove a sentence from the session
  @Delete(':id/sentences/:sentenceId')
  removeSentence(
    @Param('id') id: string,
    @Param('sentenceId') sentenceId: string,
    @User() user,
  ) {
    return this.annotationSessionsService.removeAnnotatedSentence(
      id,
      user.userId,
      sentenceId,
    );
  }

  // Export sentences from the session
  @Post(':id/export')
  exportSession(
    @Param('id') id: string,
    @Body() exportDto: ExportSessionDto,
    @User() user,
  ) {
    return this.annotationSessionsService.exportSession(
      id,
      user.userId,
      exportDto,
    );
  }

  // Regenerate download URL for an export
  @Post(':id/exports/:exportIndex/regenerate-url')
  regenerateExportUrl(
    @Param('id') id: string,
    @Param('exportIndex') exportIndex: string,
    @User() user,
  ) {
    return this.annotationSessionsService.regenerateExportUrl(
      id,
      user.userId,
      parseInt(exportIndex, 10),
    );
  }

  // Check if a sentence has been exported
  @Get('sentence/:sentenceId/exported')
  isSentenceExported(@Param('sentenceId') sentenceId: string, @User() user) {
    return this.annotationSessionsService.isSentenceExported(
      sentenceId,
      user.userId,
    );
  }

  // Delete a session
  @Delete(':id')
  delete(@Param('id') id: string, @User() user) {
    return this.annotationSessionsService.delete(id, user.userId);
  }
}
