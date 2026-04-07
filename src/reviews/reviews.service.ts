import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IReviewSession, ReviewSessionStatus } from './review-session.schema';
import { IReviewAssignment } from './review-assignment.schema';
import { Sentences } from '../sentences/sentences.schema';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { QAStatus } from '../sentences/types/data-collection.types';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel('ReviewSession')
    private reviewSessionModel: Model<IReviewSession>,
    @InjectModel('ReviewAssignment')
    private reviewAssignmentModel: Model<IReviewAssignment>,
    @InjectModel('Sentences') private sentenceModel: Model<Sentences>,
    @InjectModel('DocumentUpload') private documentUploadModel: Model<any>,
  ) {}

  // ==================== ADMIN: ASSIGN REVIEWER ====================

  async assignReviewer(reviewerId: string, annotatorId: string) {
    // Validate both IDs
    const reviewerObjectId = new Types.ObjectId(reviewerId);
    const annotatorObjectId = new Types.ObjectId(annotatorId);

    // Check for existing assignment
    const existing = await this.reviewAssignmentModel
      .findOne({
        reviewer_id: reviewerObjectId,
        annotator_id: annotatorObjectId,
      })
      .lean()
      .exec();

    if (existing) {
      throw new ConflictException(
        'This reviewer is already assigned to this annotator',
      );
    }

    const assignment = new this.reviewAssignmentModel({
      reviewer_id: reviewerObjectId,
      annotator_id: annotatorObjectId,
    });

    await assignment.save();
    return assignment;
  }

  async getAllAssignments() {
    const assignments = await this.reviewAssignmentModel
      .find()
      .populate('reviewer_id', 'email')
      .populate('annotator_id', 'email')
      .lean()
      .exec();
    return assignments;
  }

  async removeAssignment(reviewerId: string, annotatorId: string) {
    const result = await this.reviewAssignmentModel
      .findOneAndDelete({
        reviewer_id: new Types.ObjectId(reviewerId),
        annotator_id: new Types.ObjectId(annotatorId),
      })
      .exec();

    if (!result) {
      throw new NotFoundException('Assignment not found');
    }
    return { message: 'Assignment removed' };
  }

  // ==================== REVIEWER: ASSIGNMENTS & SESSIONS ====================

  async getMyAssignments(reviewerId: string) {
    const assignments = await this.reviewAssignmentModel
      .find({ reviewer_id: new Types.ObjectId(reviewerId) })
      .populate('annotator_id', 'email')
      .lean()
      .exec();

    return assignments;
  }

  async getAnnotatorSessions(reviewerId: string, annotatorId: string) {
    // Verify reviewer is assigned to this annotator
    const assignment = await this.reviewAssignmentModel
      .findOne({
        reviewer_id: new Types.ObjectId(reviewerId),
        annotator_id: new Types.ObjectId(annotatorId),
      })
      .lean()
      .exec();

    if (!assignment) {
      throw new BadRequestException(
        'You are not assigned to review this annotator',
      );
    }

    // Get sessions (uploads) that have sentences annotated by this annotator
    const annotatorObjectId = new Types.ObjectId(annotatorId);

    // Find distinct document_ids where this annotator has annotated sentences
    const documentIds = await this.sentenceModel
      .distinct('document_id', {
        annotator_id: annotatorObjectId,
        bias_label: { $exists: true, $ne: null },
      })
      .exec();

    if (documentIds.length === 0) {
      return [];
    }

    // Get the upload records for these sessions
    const uploads = await this.documentUploadModel
      .find({ document_id: { $in: documentIds } })
      .sort({ created_at: -1 })
      .lean()
      .exec();

    // For each upload, get count of annotated sentences by this annotator
    const sessionsWithCounts = await Promise.all(
      uploads.map(async (upload) => {
        const annotatedCount = await this.sentenceModel.countDocuments({
          document_id: upload.document_id,
          annotator_id: annotatorObjectId,
          bias_label: { $exists: true, $ne: null },
        });

        // Check if already has an active review session
        const existingReview = await this.reviewSessionModel
          .findOne({
            reviewer_id: new Types.ObjectId(reviewerId),
            document_id: upload.document_id,
            status: ReviewSessionStatus.ACTIVE,
          })
          .lean()
          .exec();

        return {
          ...upload,
          annotated_count: annotatedCount,
          has_active_review: !!existingReview,
          active_review_id: existingReview?._id || null,
        };
      }),
    );

    return sessionsWithCounts;
  }

  // ==================== REVIEWER: START REVIEW ====================

  async startSessionReview(
    reviewerId: string,
    documentId: string,
    annotatorId: string,
  ) {
    // Verify assignment
    const assignment = await this.reviewAssignmentModel
      .findOne({
        reviewer_id: new Types.ObjectId(reviewerId),
        annotator_id: new Types.ObjectId(annotatorId),
      })
      .lean()
      .exec();

    if (!assignment) {
      throw new BadRequestException(
        'You are not assigned to review this annotator',
      );
    }

    // Check for existing active review of this session
    const existingReview = await this.reviewSessionModel
      .findOne({
        reviewer_id: new Types.ObjectId(reviewerId),
        document_id: documentId,
        status: ReviewSessionStatus.ACTIVE,
      })
      .lean()
      .exec();

    if (existingReview) {
      throw new ConflictException(
        'You already have an active review for this session',
      );
    }

    // Get annotated sentences from this session by this annotator
    const sentences = await this.sentenceModel
      .find({
        document_id: documentId,
        annotator_id: new Types.ObjectId(annotatorId),
        bias_label: { $exists: true, $ne: null },
      })
      .select('_id')
      .lean()
      .exec();

    if (sentences.length === 0) {
      throw new BadRequestException(
        'No annotated sentences found in this session for this annotator',
      );
    }

    const sentenceObjectIds = sentences.map((s) => s._id);

    // Get upload info for the session name
    const upload = (await this.documentUploadModel
      .findOne({ document_id: documentId })
      .lean()
      .exec()) as any;

    const sessionName =
      upload?.original_filename?.replace(/\.[^/.]+$/, '') ||
      `Review ${documentId.slice(0, 8)}`;

    const session = new this.reviewSessionModel({
      name: sessionName,
      reviewer_id: new Types.ObjectId(reviewerId),
      annotator_id: new Types.ObjectId(annotatorId),
      document_id: documentId,
      sentence_ids: sentenceObjectIds,
      total_sentences: sentenceObjectIds.length,
    });

    await session.save();

    return {
      _id: session._id,
      name: session.name,
      total_sentences: sentenceObjectIds.length,
      document_id: documentId,
      status: session.status,
    };
  }

  async getReviewSessions(userId: string) {
    return this.reviewSessionModel
      .find({ reviewer_id: new Types.ObjectId(userId) })
      .sort({ created_at: -1 })
      .lean()
      .exec();
  }

  async getReviewSession(id: string) {
    const session = await this.reviewSessionModel.findById(id).lean().exec();
    if (!session) {
      throw new NotFoundException('Review session not found');
    }
    return session;
  }

  async getReviewSessionStats(id: string) {
    const session = await this.getReviewSession(id);
    return {
      total_sentences: session.total_sentences,
      total_reviewed: session.total_reviewed,
      total_accepted: session.total_accepted,
      total_rejected: session.total_rejected,
      remaining: session.total_sentences - session.total_reviewed,
      status: session.status,
    };
  }

  async getReviewSentences(id: string, filter?: string) {
    const session = await this.getReviewSession(id);

    let sentenceIds: Types.ObjectId[];

    if (filter === 'reviewed') {
      sentenceIds = session.reviewed_sentence_ids;
    } else if (filter === 'pending') {
      const reviewedSet = new Set(
        session.reviewed_sentence_ids.map((id) => id.toString()),
      );
      // Pending = not yet reviewed OR reviewed but disputed (appealed by annotator)
      const notReviewed = session.sentence_ids.filter(
        (id) => !reviewedSet.has(id.toString()),
      );

      // Also include disputed sentences (reviewed but appealed)
      const disputedSentences = await this.sentenceModel
        .find({
          _id: { $in: session.sentence_ids },
          qa_status: QAStatus.DISPUTED,
        })
        .select('_id')
        .lean()
        .exec();
      const disputedIds = disputedSentences.map((s) => s._id);

      // Merge not-reviewed and disputed (avoid duplicates)
      const notReviewedSet = new Set(notReviewed.map((id) => id.toString()));
      sentenceIds = [
        ...notReviewed,
        ...disputedIds.filter((id) => !notReviewedSet.has(id.toString())),
      ];
    } else {
      sentenceIds = session.sentence_ids;
    }

    if (sentenceIds.length === 0) {
      return [];
    }

    return this.sentenceModel
      .find({ _id: { $in: sentenceIds } })
      .populate('collector_id', 'email first_name last_name')
      .populate('annotator_id', 'email first_name last_name')
      .populate('review_history.user_id', 'email first_name last_name')
      .lean()
      .exec();
  }

  async submitReview(
    sessionId: string,
    sentenceId: string,
    userId: string,
    dto: SubmitReviewDto,
  ) {
    const session = await this.reviewSessionModel.findById(sessionId).exec();
    if (!session) {
      throw new NotFoundException('Review session not found');
    }

    if (session.reviewer_id.toString() !== userId) {
      throw new BadRequestException('You are not the reviewer of this session');
    }

    // Verify sentence belongs to this session
    const sentenceObjectId = new Types.ObjectId(sentenceId);
    const belongsToSession = session.sentence_ids.some(
      (id) => id.toString() === sentenceId,
    );
    if (!belongsToSession) {
      throw new BadRequestException(
        'This sentence does not belong to this review session',
      );
    }

    // Check if already reviewed in this session — update the review
    const alreadyReviewed = session.reviewed_sentence_ids.some(
      (id) => id.toString() === sentenceId,
    );

    // Get old qa_status of the sentence to adjust counters if re-reviewing
    let oldQAStatus: string | null = null;
    if (alreadyReviewed) {
      const oldSentence = await this.sentenceModel
        .findById(sentenceId)
        .select('qa_status')
        .lean()
        .exec();
      oldQAStatus = oldSentence?.qa_status || null;
    }

    // Only allow accepted, rejected for review decisions
    const allowedStatuses = [QAStatus.ACCEPTED, QAStatus.REJECTED];
    if (!allowedStatuses.includes(dto.qa_status)) {
      throw new BadRequestException(
        'Review decision must be one of: accepted, rejected',
      );
    }

    // Update the sentence's qa_status and review_notes, clear dispute_notes on re-review
    // Also push to review_history for conversation trail
    await this.sentenceModel
      .findByIdAndUpdate(sentenceId, {
        qa_status: dto.qa_status,
        review_notes: dto.review_notes || null,
        dispute_notes: null,
        $push: {
          review_history: {
            user_id: new Types.ObjectId(userId),
            action: dto.qa_status, // 'accepted' or 'rejected'
            notes: dto.review_notes || null,
            created_at: new Date(),
          },
        },
      })
      .exec();

    // Update session counters
    const updateOps: any = {
      last_activity_at: new Date(),
    };

    if (!alreadyReviewed) {
      updateOps.$addToSet = { reviewed_sentence_ids: sentenceObjectId };
      updateOps.$inc = {
        total_reviewed: 1,
        ...(dto.qa_status === QAStatus.ACCEPTED && { total_accepted: 1 }),
        ...(dto.qa_status === QAStatus.REJECTED && { total_rejected: 1 }),
      };
    } else {
      // When re-reviewing, adjust counters: decrement old, increment new
      const decrements: any = {};
      if (oldQAStatus === QAStatus.ACCEPTED) decrements.total_accepted = -1;
      if (oldQAStatus === QAStatus.REJECTED) decrements.total_rejected = -1;
      // DISPUTED was previously REJECTED, so decrement rejected counter
      if (oldQAStatus === QAStatus.DISPUTED) decrements.total_rejected = -1;

      const increments: any = {};
      if (dto.qa_status === QAStatus.ACCEPTED) increments.total_accepted = 1;
      if (dto.qa_status === QAStatus.REJECTED) increments.total_rejected = 1;

      updateOps.$inc = {
        ...decrements,
        ...increments,
      };
    }

    await this.reviewSessionModel
      .findByIdAndUpdate(sessionId, updateOps)
      .exec();

    // Check if all sentences reviewed → auto-complete
    const updatedSession = await this.reviewSessionModel
      .findById(sessionId)
      .lean()
      .exec();

    if (
      updatedSession &&
      updatedSession.total_reviewed >= updatedSession.total_sentences
    ) {
      await this.reviewSessionModel
        .findByIdAndUpdate(sessionId, {
          status: ReviewSessionStatus.COMPLETED,
          completed_at: new Date(),
        })
        .exec();
    }

    return {
      sentence_id: sentenceId,
      qa_status: dto.qa_status,
      review_notes: dto.review_notes || null,
      session_progress: {
        total_reviewed: updatedSession?.total_reviewed || 0,
        total_sentences: updatedSession?.total_sentences || 0,
      },
    };
  }
}
