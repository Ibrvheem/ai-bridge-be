import mongoose from 'mongoose';

export enum ReviewSessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

export const ReviewSession = new mongoose.Schema(
  {
    name: { type: String, required: true },
    reviewer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    annotator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    document_id: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(ReviewSessionStatus),
      default: ReviewSessionStatus.ACTIVE,
    },
    sentence_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sentences',
      },
    ],
    reviewed_sentence_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sentences',
      },
    ],
    total_sentences: { type: Number, default: 0 },
    total_reviewed: { type: Number, default: 0 },
    total_accepted: { type: Number, default: 0 },
    total_rejected: { type: Number, default: 0 },
    started_at: { type: Date, default: Date.now },
    last_activity_at: { type: Date, default: Date.now },
    completed_at: { type: Date },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
);

ReviewSession.index({ reviewer_id: 1, status: 1 });
ReviewSession.index({ reviewer_id: 1, created_at: -1 });

export interface IReviewSession extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  reviewer_id: mongoose.Types.ObjectId;
  annotator_id: mongoose.Types.ObjectId;
  document_id: string;
  status: ReviewSessionStatus;
  sentence_ids: mongoose.Types.ObjectId[];
  reviewed_sentence_ids: mongoose.Types.ObjectId[];
  total_sentences: number;
  total_reviewed: number;
  total_accepted: number;
  total_rejected: number;
  started_at: Date;
  last_activity_at: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}
