import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateSentenceDto } from './dto/create-sentence.dto';
import { UpdateSentenceDto } from './dto/update-sentence.dto';
import { BulkCreateSentenceDto } from './dto/bulk-create-sentence.dto';
import { Sentences } from './sentences.schema';
import { LanguageService } from 'src/language/language.service';
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
    private readonly languageService: LanguageService,
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
}
