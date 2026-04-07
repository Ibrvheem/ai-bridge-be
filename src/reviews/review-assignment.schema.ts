import mongoose from 'mongoose';

export const ReviewAssignment = new mongoose.Schema(
  {
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
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
);

ReviewAssignment.index({ reviewer_id: 1 });
ReviewAssignment.index({ reviewer_id: 1, annotator_id: 1 }, { unique: true });

export interface IReviewAssignment extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  reviewer_id: mongoose.Types.ObjectId;
  annotator_id: mongoose.Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}
