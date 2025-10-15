import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateSentenceDto } from './dto/create-sentence.dto';
import { UpdateSentenceDto } from './dto/update-sentence.dto';
import { BulkCreateSentenceDto } from './dto/bulk-create-sentence.dto';
import { Sentences } from './sentences.schema';
import { LanguageService } from 'src/language/language.service';
import { AnnotateSentenceDto } from './dto/annotate-sentences.dto';

@Injectable()
export class SentencesService {
  constructor(
    @InjectModel('Sentences') private sentenceModel: Model<Sentences>,
    private readonly languageService: LanguageService
  ) { }

  async create(createSentenceDto: CreateSentenceDto, user_id: string) {
    const createdSentence = new this.sentenceModel({ ...createSentenceDto, user: user_id });
    return createdSentence.save();
  }

  async bulkCreate(bulkCreateSentenceDto: BulkCreateSentenceDto, user_id: string) {
    try {
      // If document_id is provided, add it to all sentences
      // For language: use per-row language if present, otherwise fallback to bulkCreateSentenceDto.language
      const sentencesToInsert = bulkCreateSentenceDto.sentences.map(sentence => ({
        ...sentence,
        document_id: bulkCreateSentenceDto.document_id,
        language: sentence.language || bulkCreateSentenceDto.language,
        user: user_id
      }));

      const result = await this.sentenceModel.insertMany(
        sentencesToInsert,
        { ordered: false } // Continue inserting even if some fail
      );

      return {
        success: true,
        insertedCount: result.length,
        sentences: result,
        document_id: bulkCreateSentenceDto.document_id,
        errors: []
      };
    } catch (error) {
      console.error('Bulk insert error:', error);

      // Handle different types of MongoDB bulk insert errors
      if (error.writeErrors || error.insertedDocs !== undefined) {
        const successfulInserts = error.insertedDocs || [];
        const writeErrors = error.writeErrors || [];

        return {
          success: false,
          insertedCount: successfulInserts.length,
          sentences: successfulInserts,
          document_id: bulkCreateSentenceDto.document_id,
          errors: writeErrors.map(err => ({
            index: err.index,
            error: err.errmsg || err.message || 'Database insertion error',
          })),
        };
      }

      // Handle other types of errors (validation, connection, etc.)
      return {
        success: false,
        insertedCount: 0,
        sentences: [],
        document_id: bulkCreateSentenceDto.document_id,
        errors: [{
          index: 0,
          error: error.message || 'Unknown database error'
        }]
      };
    }
  }

  async findAll() {
    const response = await this.sentenceModel
      .find()
      .populate('user', 'email') // Populate user details
      .exec();

    return response;
  }
  async getAllUnannotatedSentences() {
    const response = await this.sentenceModel
      .find({
        annotated_by: { $exists: false },
      })
      .populate('user', 'email') // Populate user details
      .exec();

    return response;
  }
  async getAllAnnotatedSentences() {
    const response = await this.sentenceModel
      .find({
        annotated_by: { $exists: true },
      })
      .populate('user', 'email') // Populate user details
      .populate('annotated_by', 'email') // Populate annotated_by user details

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

  async findByBiasCategory(biasCategory: string) {
    return this.sentenceModel.find({ bias_category: biasCategory }).exec();
  }

  async findByLanguage(language: string) {
    return this.sentenceModel.find({ language }).exec();
  }

  async findByDocumentId(documentId: string) {
    return this.sentenceModel.find({ document_id: documentId }).exec();
  }

  async deleteByDocumentId(documentId: string) {
    const result = await this.sentenceModel.deleteMany({ document_id: documentId }).exec();
    return {
      success: true,
      deletedCount: result.deletedCount,
      document_id: documentId,
    };
  }

  async getDocumentIds() {
    const documents = await this.sentenceModel.distinct('document_id').exec();
    return documents.filter(doc => doc); // Filter out null/undefined values
  }

  async getDocumentStats() {
    const pipeline = [
      { $match: { document_id: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$document_id',
          count: { $sum: 1 },
          languages: { $addToSet: '$language' },
          bias_categories: { $addToSet: '$bias_category' },
          created_at: { $min: '$created_at' }
        }
      },
      { $sort: { created_at: -1 as -1 } }
    ];

    return this.sentenceModel.aggregate(pipeline).exec();
  }

  async annotateSentence(id: string, userId: string, payload: AnnotateSentenceDto) {
    return this.sentenceModel.findByIdAndUpdate(id, { ...payload, annotated_by: userId }, { new: true }).exec();
  }

  async getCategories() {
    return [
      { value: "GENDER", label: "Gender" },
      { value: "RACE_ETHNICITY", label: "Race / ethnicity" },
      { value: "AGE", label: "Age (young / middle / elderly; also continuous age ranges)" },
      { value: "DISABILITY", label: "Disability (visible, invisible, physical, cognitive)" },
      { value: "RELIGION", label: "Religion / belief system" },
      { value: "NATIONALITY", label: "Nationality / immigration status" },
      { value: "SOCIOECONOMIC", label: "Socioeconomic status (income, education)" },
      { value: "NONE", label: "No specific bias" }
    ];
  }
}
