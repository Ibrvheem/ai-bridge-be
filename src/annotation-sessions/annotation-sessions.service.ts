import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IAnnotationSession, SessionStatus } from './annotation-session.schema';
import {
  CreateAnnotationSessionDto,
  UpdateAnnotationSessionDto,
  ExportSessionDto,
} from './dto';
import { UploadService } from '../upload/upload.service';
import { createObjectCsvStringifier } from 'csv-writer';

@Injectable()
export class AnnotationSessionsService {
  constructor(
    @InjectModel('AnnotationSession')
    private annotationSessionModel: Model<IAnnotationSession>,
    @InjectModel('Sentences') private sentenceModel: Model<any>,
    private readonly uploadService: UploadService,
  ) {}

  // Create a new annotation session
  async create(
    createDto: CreateAnnotationSessionDto,
    userId: string,
  ): Promise<IAnnotationSession> {
    const session = new this.annotationSessionModel({
      ...createDto,
      user_id: new Types.ObjectId(userId),
      status: SessionStatus.ACTIVE,
      annotated_sentence_ids: [],
      exported_sentence_ids: [],
      total_annotated: 0,
      total_exported: 0,
      started_at: new Date(),
      last_activity_at: new Date(),
      exports: [],
    });

    return session.save();
  }

  // Get all sessions for a user
  async findAllByUser(userId: string): Promise<IAnnotationSession[]> {
    return this.annotationSessionModel
      .find({ user_id: new Types.ObjectId(userId) })
      .sort({ created_at: -1 })
      .exec();
  }

  // Get a single session
  async findOne(
    sessionId: string,
    userId: string,
  ): Promise<IAnnotationSession> {
    const session = await this.annotationSessionModel
      .findOne({
        _id: new Types.ObjectId(sessionId),
        user_id: new Types.ObjectId(userId),
      })
      .exec();

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  // Get session with populated sentences
  async findOneWithSentences(sessionId: string, userId: string) {
    const session = await this.findOne(sessionId, userId);

    // Get annotated sentences from this session
    const annotatedSentences = await this.sentenceModel
      .find({
        _id: { $in: session.annotated_sentence_ids },
      })
      .populate('collector_id', 'email first_name last_name')
      .populate('annotator_id', 'email first_name last_name')
      .exec();

    // Get count of exportable (not yet exported) sentences
    const exportableCount = session.annotated_sentence_ids.filter(
      (id) =>
        !session.exported_sentence_ids.some(
          (exportedId) => exportedId.toString() === id.toString(),
        ),
    ).length;

    return {
      ...session.toObject(),
      sentences: annotatedSentences,
      exportable_count: exportableCount,
    };
  }

  // Update session
  async update(
    sessionId: string,
    userId: string,
    updateDto: UpdateAnnotationSessionDto,
  ): Promise<IAnnotationSession> {
    const session = await this.findOne(sessionId, userId);

    if (updateDto.status === SessionStatus.COMPLETED && !session.completed_at) {
      (session as any).completed_at = new Date();
    }

    Object.assign(session, updateDto);
    session.last_activity_at = new Date();

    return session.save();
  }

  // Add an annotated sentence to the session
  async addAnnotatedSentence(
    sessionId: string,
    userId: string,
    sentenceId: string,
  ): Promise<IAnnotationSession> {
    const session = await this.findOne(sessionId, userId);

    const sentenceObjectId = new Types.ObjectId(sentenceId);

    // Check if sentence already in session
    if (
      session.annotated_sentence_ids.some(
        (id) => id.toString() === sentenceObjectId.toString(),
      )
    ) {
      // Just update last activity
      session.last_activity_at = new Date();
      return session.save();
    }

    // Add sentence to session
    session.annotated_sentence_ids.push(sentenceObjectId);
    session.total_annotated = session.annotated_sentence_ids.length;
    session.last_activity_at = new Date();

    return session.save();
  }

  // Remove an annotated sentence from the session
  async removeAnnotatedSentence(
    sessionId: string,
    userId: string,
    sentenceId: string,
  ): Promise<IAnnotationSession> {
    const session = await this.findOne(sessionId, userId);

    const sentenceObjectId = new Types.ObjectId(sentenceId);

    // Check if sentence has been exported - can't remove exported sentences
    if (
      session.exported_sentence_ids.some(
        (id) => id.toString() === sentenceObjectId.toString(),
      )
    ) {
      throw new BadRequestException(
        'Cannot remove an already exported sentence from session',
      );
    }

    session.annotated_sentence_ids = session.annotated_sentence_ids.filter(
      (id) => id.toString() !== sentenceObjectId.toString(),
    );
    session.total_annotated = session.annotated_sentence_ids.length;
    session.last_activity_at = new Date();

    return session.save();
  }

  // Export sentences from session (only exports non-exported sentences)
  async exportSession(
    sessionId: string,
    userId: string,
    exportDto: ExportSessionDto = {},
  ) {
    const session = await this.findOne(sessionId, userId);

    // Determine which sentences to export
    let sentenceIdsToExport: Types.ObjectId[];

    if (exportDto.sentence_ids && exportDto.sentence_ids.length > 0) {
      // Export specific sentences
      sentenceIdsToExport = exportDto.sentence_ids.map(
        (id) => new Types.ObjectId(id),
      );

      // Validate that all requested sentences are in the session
      const invalidIds = sentenceIdsToExport.filter(
        (id) =>
          !session.annotated_sentence_ids.some(
            (annotatedId) => annotatedId.toString() === id.toString(),
          ),
      );

      if (invalidIds.length > 0) {
        throw new BadRequestException(
          'Some requested sentences are not in this session',
        );
      }

      // Filter out already exported sentences
      sentenceIdsToExport = sentenceIdsToExport.filter(
        (id) =>
          !session.exported_sentence_ids.some(
            (exportedId) => exportedId.toString() === id.toString(),
          ),
      );
    } else {
      // Export all non-exported sentences
      sentenceIdsToExport = session.annotated_sentence_ids.filter(
        (id) =>
          !session.exported_sentence_ids.some(
            (exportedId) => exportedId.toString() === id.toString(),
          ),
      );
    }

    if (sentenceIdsToExport.length === 0) {
      throw new BadRequestException('No new sentences to export');
    }

    // Fetch the sentences to export
    const sentences = await this.sentenceModel
      .find({ _id: { $in: sentenceIdsToExport } })
      .populate('collector_id', 'email')
      .populate('annotator_id', 'email')
      .exec();

    // Generate CSV
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: '_id', title: 'sentence_id' },
        { id: 'language', title: 'language' },
        { id: 'script', title: 'script' },
        { id: 'country', title: 'country' },
        { id: 'region_dialect', title: 'region_dialect' },
        { id: 'source_type', title: 'source_type' },
        { id: 'source_ref', title: 'source_ref' },
        { id: 'collection_date', title: 'collection_date' },
        { id: 'text', title: 'text' },
        { id: 'domain', title: 'domain' },
        { id: 'topic', title: 'topic' },
        { id: 'theme', title: 'theme' },
        { id: 'sensitive_characteristic', title: 'sensitive_characteristic' },
        { id: 'safety_flag', title: 'safety_flag' },
        { id: 'pii_removed', title: 'pii_removed' },
        { id: 'target_gender', title: 'target_gender' },
        { id: 'bias_label', title: 'bias_label' },
        { id: 'explicitness', title: 'explicitness' },
        { id: 'stereotype_category', title: 'stereotype_category' },
        { id: 'sentiment_toward_referent', title: 'sentiment_toward_referent' },
        { id: 'device', title: 'device' },
        { id: 'qa_status', title: 'qa_status' },
        { id: 'annotation_date', title: 'annotation_date' },
        { id: 'collector_email', title: 'collector_email' },
        { id: 'annotator_email', title: 'annotator_email' },
        { id: 'notes', title: 'notes' },
      ],
    });

    const records = sentences.map((sentence) => ({
      _id: sentence._id.toString(),
      language: sentence.language || '',
      script: sentence.script || '',
      country: sentence.country || '',
      region_dialect: sentence.region_dialect || '',
      source_type: sentence.source_type || '',
      source_ref: sentence.source_ref || '',
      collection_date: sentence.collection_date
        ? new Date(sentence.collection_date).toISOString()
        : '',
      text: sentence.text || '',
      domain: sentence.domain || '',
      topic: sentence.topic || '',
      theme: sentence.theme || '',
      sensitive_characteristic: sentence.sensitive_characteristic || '',
      safety_flag: sentence.safety_flag || '',
      pii_removed: sentence.pii_removed?.toString() || '',
      target_gender: sentence.target_gender || '',
      bias_label: sentence.bias_label || '',
      explicitness: sentence.explicitness || '',
      stereotype_category: sentence.stereotype_category || '',
      sentiment_toward_referent: sentence.sentiment_toward_referent || '',
      device: sentence.device || '',
      qa_status: sentence.qa_status || '',
      annotation_date: sentence.annotation_date
        ? new Date(sentence.annotation_date).toISOString()
        : '',
      collector_email: (sentence.collector_id as any)?.email || '',
      annotator_email: (sentence.annotator_id as any)?.email || '',
      notes: sentence.notes || '',
    }));

    const csvContent =
      csvStringifier.getHeaderString() +
      csvStringifier.stringifyRecords(records);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName =
      exportDto.file_name ||
      `${session.name.toLowerCase().replace(/\s+/g, '-')}-export-${timestamp}.csv`;

    // Upload CSV to S3
    const filePath = `${userId}/session-exports/${session._id}/${fileName}`;
    await this.uploadService.upload({
      filePath,
      file: Buffer.from(csvContent, 'utf-8'),
    });

    // Get download URL
    const downloadUrl = await this.uploadService.getFileUrl(filePath, 86400); // 24 hour expiry

    // Update session with export info
    session.exported_sentence_ids.push(...sentenceIdsToExport);
    session.total_exported = session.exported_sentence_ids.length;
    session.exports.push({
      exported_at: new Date(),
      exported_by: new Types.ObjectId(userId),
      sentence_count: sentenceIdsToExport.length,
      file_name: fileName,
      download_url: downloadUrl,
    });
    session.last_activity_at = new Date();

    await session.save();

    return {
      success: true,
      message: `Successfully exported ${sentenceIdsToExport.length} sentences`,
      export: {
        file_name: fileName,
        download_url: downloadUrl,
        sentence_count: sentenceIdsToExport.length,
        exported_at: new Date(),
      },
      session: {
        total_annotated: session.total_annotated,
        total_exported: session.total_exported,
        remaining_to_export: session.total_annotated - session.total_exported,
      },
    };
  }

  // Get session statistics
  async getSessionStats(sessionId: string, userId: string) {
    const session = await this.findOne(sessionId, userId);

    const exportableCount = session.annotated_sentence_ids.filter(
      (id) =>
        !session.exported_sentence_ids.some(
          (exportedId) => exportedId.toString() === id.toString(),
        ),
    ).length;

    return {
      total_annotated: session.total_annotated,
      total_exported: session.total_exported,
      exportable_count: exportableCount,
      exports_count: session.exports.length,
      status: session.status,
      started_at: session.started_at,
      last_activity_at: session.last_activity_at,
      completed_at: session.completed_at,
    };
  }

  // Get user's overall stats across all sessions
  async getUserSessionStats(userId: string) {
    const sessions = await this.annotationSessionModel
      .find({ user_id: new Types.ObjectId(userId) })
      .exec();

    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(
      (s) => s.status === SessionStatus.ACTIVE,
    ).length;
    const completedSessions = sessions.filter(
      (s) =>
        s.status === SessionStatus.COMPLETED ||
        s.status === SessionStatus.EXPORTED,
    ).length;
    const totalAnnotated = sessions.reduce(
      (sum, s) => sum + s.total_annotated,
      0,
    );
    const totalExported = sessions.reduce(
      (sum, s) => sum + s.total_exported,
      0,
    );

    // Get all unique exported sentence IDs to ensure no duplicates in exports
    const allExportedIds = new Set(
      sessions.flatMap((s) =>
        s.exported_sentence_ids.map((id) => id.toString()),
      ),
    );

    return {
      total_sessions: totalSessions,
      active_sessions: activeSessions,
      completed_sessions: completedSessions,
      total_annotated: totalAnnotated,
      total_exported: totalExported,
      unique_exported_sentences: allExportedIds.size,
    };
  }

  // Delete session
  async delete(sessionId: string, userId: string): Promise<void> {
    const session = await this.findOne(sessionId, userId);

    if (session.total_exported > 0) {
      throw new BadRequestException(
        'Cannot delete a session that has exports. Please archive it instead.',
      );
    }

    await this.annotationSessionModel.deleteOne({
      _id: new Types.ObjectId(sessionId),
    });
  }

  // Check if a sentence has been exported in any session
  async isSentenceExported(
    sentenceId: string,
    userId: string,
  ): Promise<boolean> {
    const session = await this.annotationSessionModel.findOne({
      user_id: new Types.ObjectId(userId),
      exported_sentence_ids: new Types.ObjectId(sentenceId),
    });

    return !!session;
  }

  // Get export history for a session
  async getExportHistory(sessionId: string, userId: string) {
    const session = await this.findOne(sessionId, userId);
    return session.exports;
  }

  // Regenerate download URL for an export
  async regenerateExportUrl(
    sessionId: string,
    userId: string,
    exportIndex: number,
  ) {
    const session = await this.findOne(sessionId, userId);

    if (exportIndex < 0 || exportIndex >= session.exports.length) {
      throw new NotFoundException('Export not found');
    }

    const exportRecord = session.exports[exportIndex];
    const filePath = `${userId}/session-exports/${session._id}/${exportRecord.file_name}`;

    try {
      const newUrl = await this.uploadService.getFileUrl(filePath, 86400);
      session.exports[exportIndex].download_url = newUrl;
      await session.save();

      return {
        download_url: newUrl,
        file_name: exportRecord.file_name,
        expires_in: 86400,
      };
    } catch (error) {
      throw new NotFoundException(
        'Export file not found. It may have been deleted.',
      );
    }
  }
}
