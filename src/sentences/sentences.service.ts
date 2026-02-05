import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateSentenceDto } from './dto/create-sentence.dto';
import { UpdateSentenceDto } from './dto/update-sentence.dto';
import { BulkCreateSentenceDto } from './dto/bulk-create-sentence.dto';
import { Sentences } from './sentences.schema';
import { IAnnotationExport } from './annotation-export.schema';
import { LanguageService } from 'src/language/language.service';
import { UploadService } from '../upload/upload.service';
import { createObjectCsvStringifier } from 'csv-writer';
import {
  AnnotateSentenceDto,
  TargetGender,
  BiasLabel,
  Explicitness,
  StereotypeCategory,
  SentimentTowardReferent,
  Device,
  QAStatus,
} from './dto/annotate-sentences.dto';
import {
  Script,
  SourceType,
  Domain,
  Theme,
  SensitiveCharacteristic,
  SafetyFlag,
} from './types/data-collection.types';

@Injectable()
export class SentencesService {
  constructor(
    @InjectModel('Sentences') private sentenceModel: Model<Sentences>,
    @InjectModel('AnnotationExport')
    private annotationExportModel: Model<IAnnotationExport>,
    private readonly languageService: LanguageService,
    private readonly uploadService: UploadService,
  ) {}

  async create(createSentenceDto: CreateSentenceDto, user_id: string) {
    const data = {
      ...createSentenceDto,
      collector_id: user_id,
    };
    const createdSentence = new this.sentenceModel(data);
    return createdSentence.save();
  }

  async bulkCreate(
    bulkCreateSentenceDto: BulkCreateSentenceDto,
    user_id: string,
  ) {
    try {
      const sentencesToInsert = bulkCreateSentenceDto.sentences.map(
        (sentence) => ({
          ...sentence,
          language: sentence.language || bulkCreateSentenceDto.language,
          document_id: bulkCreateSentenceDto.document_id,
          collector_id: user_id,
        }),
      );

      const result = await this.sentenceModel.insertMany(sentencesToInsert, {
        ordered: false,
      });

      return {
        success: true,
        insertedCount: result.length,
        sentences: result,
        errors: [],
        document_id: bulkCreateSentenceDto.document_id,
      };
    } catch (error) {
      console.error('Bulk insert error:', error);

      if (error.writeErrors || error.insertedDocs !== undefined) {
        const successfulInserts = error.insertedDocs || [];
        const writeErrors = error.writeErrors || [];

        return {
          success: false,
          insertedCount: successfulInserts.length,
          sentences: successfulInserts,
          errors: writeErrors.map((err) => ({
            index: err.index,
            error: err.errmsg || err.message || 'Database insertion error',
          })),
        };
      }

      return {
        success: false,
        insertedCount: 0,
        sentences: [],
        errors: [
          {
            index: 0,
            error: error.message || 'Unknown database error',
          },
        ],
      };
    }
  }

  async findAll() {
    const response = await this.sentenceModel
      .find()
      .populate('user', 'email')
      .populate('collector_id', 'email')
      .populate('annotator_id', 'email')
      .exec();

    return response;
  }

  async findAllPaginated(
    page: number = 1,
    limit: number = 20,
    filter?: string,
  ) {
    const skip = (page - 1) * limit;

    // Build query filter
    const queryFilter: any = {};
    if (filter === 'annotated') {
      queryFilter.bias_label = { $exists: true, $ne: null };
    } else if (filter === 'unannotated') {
      queryFilter.$or = [
        { bias_label: { $exists: false } },
        { bias_label: null },
      ];
    } else if (filter === 'exported') {
      queryFilter.exported_at = { $exists: true, $ne: null };
    }

    const [sentences, total] = await Promise.all([
      this.sentenceModel
        .find(queryFilter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('collector_id', 'email')
        .populate('annotator_id', 'email')
        .lean()
        .exec(),
      this.sentenceModel.countDocuments(queryFilter),
    ]);

    return {
      data: sentences,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getAllUnannotatedSentences() {
    const response = await this.sentenceModel
      .find({
        $or: [
          { annotator_id: { $exists: false } },
          { bias_label: { $exists: false } },
          { bias_label: null },
        ],
      })
      .populate('collector_id', 'email')
      .exec();

    return response;
  }

  async getAllAnnotatedSentences() {
    const response = await this.sentenceModel
      .find({
        annotator_id: { $exists: true },
        bias_label: { $exists: true, $ne: null },
      })
      .populate('collector_id', 'email')
      .populate('annotator_id', 'email')
      .exec();

    return response;
  }

  async findOne(id: string) {
    return this.sentenceModel.findById(id).exec();
  }

  async update(id: string, updateSentenceDto: UpdateSentenceDto) {
    return this.sentenceModel
      .findByIdAndUpdate(id, updateSentenceDto, { new: true })
      .exec();
  }

  async remove(id: string) {
    return this.sentenceModel.findByIdAndDelete(id).exec();
  }

  async findByBiasLabel(biasLabel: BiasLabel) {
    return this.sentenceModel.find({ bias_label: biasLabel }).exec();
  }

  async findByLanguage(language: string) {
    return this.sentenceModel.find({ language }).exec();
  }

  async findByDomain(domain: Domain) {
    return this.sentenceModel.find({ domain }).exec();
  }

  async findByTheme(theme: Theme) {
    return this.sentenceModel.find({ theme }).exec();
  }

  async findBySafetyFlag(safetyFlag: SafetyFlag) {
    return this.sentenceModel.find({ safety_flag: safetyFlag }).exec();
  }

  async findByQAStatus(qaStatus: QAStatus) {
    return this.sentenceModel.find({ qa_status: qaStatus }).exec();
  }

  async findByCountry(country: string) {
    return this.sentenceModel.find({ country }).exec();
  }

  async findBySourceType(sourceType: SourceType) {
    return this.sentenceModel.find({ source_type: sourceType }).exec();
  }

  async getStats() {
    const pipeline = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          languages: { $addToSet: '$language' },
          countries: { $addToSet: '$country' },
          domains: { $addToSet: '$domain' },
          themes: { $addToSet: '$theme' },
        },
      },
    ];

    const result = await this.sentenceModel.aggregate(pipeline).exec();
    return (
      result[0] || {
        total: 0,
        languages: [],
        countries: [],
        domains: [],
        themes: [],
      }
    );
  }

  async annotateSentence(
    id: string,
    userId: string,
    payload: AnnotateSentenceDto,
  ) {
    const updateData = {
      ...payload,
      annotator_id: userId,
      annotation_date: new Date(),
    };

    return this.sentenceModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
  }

  async getAnnotationStats() {
    const pipeline = [
      {
        $facet: {
          byBiasLabel: [
            { $match: { bias_label: { $exists: true, $ne: null } } },
            { $group: { _id: '$bias_label', count: { $sum: 1 } } },
          ],
          byTargetGender: [
            { $match: { target_gender: { $exists: true, $ne: null } } },
            { $group: { _id: '$target_gender', count: { $sum: 1 } } },
          ],
          byQAStatus: [
            { $match: { qa_status: { $exists: true, $ne: null } } },
            { $group: { _id: '$qa_status', count: { $sum: 1 } } },
          ],
          byDomain: [
            { $match: { domain: { $exists: true, $ne: null } } },
            { $group: { _id: '$domain', count: { $sum: 1 } } },
          ],
          byTheme: [
            { $match: { theme: { $exists: true, $ne: null } } },
            { $group: { _id: '$theme', count: { $sum: 1 } } },
          ],
          totalAnnotated: [
            { $match: { annotator_id: { $exists: true } } },
            { $count: 'count' },
          ],
          totalUnannotated: [
            {
              $match: {
                $or: [
                  { annotator_id: { $exists: false } },
                  { annotator_id: null },
                ],
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ];

    const result = await this.sentenceModel.aggregate(pipeline).exec();
    return result[0];
  }

  async getCategories() {
    return {
      // Data Collection Enums
      script: Object.values(Script).map((v) => ({ value: v, label: v })),
      source_type: Object.values(SourceType).map((v) => ({
        value: v,
        label: v,
      })),
      domain: Object.values(Domain).map((v) => ({ value: v, label: v })),
      theme: Object.values(Theme).map((v) => ({ value: v, label: v })),
      sensitive_characteristic: Object.values(SensitiveCharacteristic).map(
        (v) => ({
          value: v,
          label: v,
        }),
      ),
      safety_flag: Object.values(SafetyFlag).map((v) => ({
        value: v,
        label: v,
      })),
      // Annotation Enums
      target_gender: Object.values(TargetGender).map((v) => ({
        value: v,
        label: v,
      })),
      bias_label: Object.values(BiasLabel).map((v) => ({ value: v, label: v })),
      explicitness: Object.values(Explicitness).map((v) => ({
        value: v,
        label: v,
      })),
      stereotype_category: Object.values(StereotypeCategory).map((v) => ({
        value: v,
        label: v,
      })),
      sentiment_toward_referent: Object.values(SentimentTowardReferent).map(
        (v) => ({
          value: v,
          label: v,
        }),
      ),
      device: Object.values(Device).map((v) => ({ value: v, label: v })),
      qa_status: Object.values(QAStatus).map((v) => ({ value: v, label: v })),
    };
  }

  // Get all exportable sentences (annotated but not yet exported)
  async getExportableSentences() {
    return this.sentenceModel
      .find({
        bias_label: { $ne: null }, // Has been annotated
        exported_at: null, // Not yet exported
      })
      .populate('collector_id', 'email first_name last_name')
      .populate('annotator_id', 'email first_name last_name')
      .sort({ annotation_date: -1 })
      .exec();
  }

  // Get export stats
  async getExportStats() {
    const [exportable, totalExported] = await Promise.all([
      this.sentenceModel.countDocuments({
        bias_label: { $ne: null },
        exported_at: null,
      }),
      this.sentenceModel.countDocuments({
        exported_at: { $ne: null },
      }),
    ]);

    return {
      exportable_count: exportable,
      total_exported: totalExported,
    };
  }

  // Export all annotated but not yet exported sentences
  async exportAnnotations(userId: string, fileName?: string) {
    // Get all exportable sentences
    const sentences = await this.getExportableSentences();

    if (sentences.length === 0) {
      throw new BadRequestException('No new sentences to export');
    }

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
    const generatedFileName = fileName || `annotations-export-${timestamp}.csv`;

    // Upload CSV to S3
    const s3Key = `${userId}/annotation-exports/${generatedFileName}`;
    await this.uploadService.upload({
      filePath: s3Key,
      file: Buffer.from(csvContent, 'utf-8'),
    });

    // Get download URL
    const downloadUrl = await this.uploadService.getFileUrl(s3Key, 86400 * 7); // 7 day expiry

    // Mark sentences as exported
    const sentenceIds = sentences.map((s) => s._id);
    const exportedAt = new Date();
    await this.sentenceModel.updateMany(
      { _id: { $in: sentenceIds } },
      { $set: { exported_at: exportedAt } },
    );

    // Create export record
    const exportRecord = new this.annotationExportModel({
      user_id: userId,
      sentence_count: sentences.length,
      file_name: generatedFileName,
      s3_key: s3Key,
      download_url: downloadUrl,
      exported_sentence_ids: sentenceIds,
      exported_at: exportedAt,
    });
    await exportRecord.save();

    return {
      success: true,
      message: `Successfully exported ${sentences.length} sentences`,
      export: {
        file_name: generatedFileName,
        download_url: downloadUrl,
        sentence_count: sentences.length,
        exported_at: exportedAt,
      },
    };
  }

  // Get export history
  async getExportHistory(userId?: string) {
    const filter = userId ? { user_id: userId } : {};
    const exports = await this.annotationExportModel
      .find(filter)
      .sort({ exported_at: -1 })
      .exec();

    // Refresh download URLs
    return Promise.all(
      exports.map(async (exp) => {
        const downloadUrl = await this.uploadService.getFileUrl(
          exp.s3_key,
          86400 * 7,
        );
        return {
          ...exp.toObject(),
          download_url: downloadUrl,
        };
      }),
    );
  }
}
