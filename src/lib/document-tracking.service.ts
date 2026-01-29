import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DocumentUpload } from '../sentences/document-upload.schema';
import { UploadService } from 'src/upload/upload.service';

export interface CreateDocumentUploadDto {
  document_id: string;
  user_id: string;
  original_filename: string;
  s3_key: string;
  file_size?: number;
  mime_type?: string;
  total_rows: number;
}

export interface UpdateDocumentUploadDto {
  successful_inserts: number;
  failed_inserts?: number;
  duplicate_count?: number;
  duplicates?: Array<{
    text: string;
    existing_document_id: string;
    row_number: number;
  }>;
  errors?: Array<{
    row_number: number;
    error: string;
  }>;
  processing_time_ms?: number;
  status: 'processing' | 'completed' | 'failed';
}

@Injectable()
export class DocumentTrackingService {
  constructor(
    @InjectModel('DocumentUpload')
    private documentUploadModel: Model<DocumentUpload>,
    private readonly uploadService: UploadService,
  ) {}

  async createDocumentRecord(
    dto: CreateDocumentUploadDto,
  ): Promise<DocumentUpload> {
    const documentRecord = new this.documentUploadModel({
      ...dto,
      status: 'processing',
      successful_inserts: 0,
      failed_inserts: 0,
      duplicate_count: 0,
      duplicates: [],
      errors: [],
    });
    return documentRecord.save();
  }

  async updateDocumentRecord(
    document_id: string,
    updateDto: UpdateDocumentUploadDto,
  ): Promise<DocumentUpload | null> {
    return this.documentUploadModel
      .findOneAndUpdate(
        { document_id },
        {
          ...updateDto,
          updated_at: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async getDocumentRecord(document_id: string): Promise<DocumentUpload | null> {
    return this.documentUploadModel.findOne({ document_id }).exec();
  }

  async getAllDocuments(user_id?: string): Promise<DocumentUpload[]> {
    const filter = user_id ? { user_id } : {};
    const history = await this.documentUploadModel
      .find(filter)
      .sort({ created_at: -1 })
      .exec();

    return Promise.all(
      history.map(async (each) => {
        return {
          ...each.toObject(),
          download_url: await this.uploadService.getFileUrl(each.s3_key),
        };
      }),
    );
  }

  async getDocumentStats(user_id?: string) {
    const matchStage = user_id ? { user_id } : {};

    return this.documentUploadModel
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total_documents: { $sum: 1 },
            total_sentences_processed: { $sum: '$total_rows' },
            total_successful_inserts: { $sum: '$successful_inserts' },
            total_duplicates: { $sum: '$duplicate_count' },
            total_errors: { $sum: '$failed_inserts' },
            completed_uploads: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            failed_uploads: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
            processing_uploads: {
              $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] },
            },
          },
        },
      ])
      .exec();
  }

  async getDuplicateReport(user_id?: string) {
    const matchStage = user_id
      ? { user_id, duplicate_count: { $gt: 0 } }
      : { duplicate_count: { $gt: 0 } };

    return this.documentUploadModel
      .find(matchStage)
      .select(
        'document_id original_filename duplicate_count duplicates created_at',
      )
      .sort({ duplicate_count: -1 })
      .exec();
  }

  async deleteDocumentRecord(document_id: string): Promise<boolean> {
    const result = await this.documentUploadModel
      .deleteOne({ document_id })
      .exec();
    return result.deletedCount > 0;
  }

  async getProcessingHistory(days: number = 30, user_id?: string) {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    const matchStage: any = { created_at: { $gte: dateThreshold } };
    if (user_id) matchStage.user_id = user_id;

    return this.documentUploadModel
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              year: { $year: '$created_at' },
              month: { $month: '$created_at' },
              day: { $dayOfMonth: '$created_at' },
            },
            uploads: { $sum: 1 },
            sentences_processed: { $sum: '$total_rows' },
            duplicates_found: { $sum: '$duplicate_count' },
            successful_inserts: { $sum: '$successful_inserts' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ])
      .exec();
  }
}
