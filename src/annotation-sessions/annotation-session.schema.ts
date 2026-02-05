import mongoose from 'mongoose';

export enum SessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  EXPORTED = 'exported',
}

export const AnnotationSession = new mongoose.Schema(
  {
    // Session metadata
    name: { type: String, required: true },
    description: { type: String },

    // User who created the session
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Session status
    status: {
      type: String,
      enum: Object.values(SessionStatus),
      default: SessionStatus.ACTIVE,
    },

    // Sentences that have been annotated in this session
    // We track sentence IDs to avoid duplicate exports
    annotated_sentence_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sentences',
      },
    ],

    // Track which sentences have already been exported
    exported_sentence_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sentences',
      },
    ],

    // Session statistics
    total_annotated: { type: Number, default: 0 },
    total_exported: { type: Number, default: 0 },

    // Time tracking
    started_at: { type: Date, default: Date.now },
    last_activity_at: { type: Date, default: Date.now },
    completed_at: { type: Date },

    // Export history
    exports: [
      {
        exported_at: { type: Date, default: Date.now },
        exported_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        sentence_count: { type: Number },
        file_name: { type: String },
        download_url: { type: String },
      },
    ],

    // Optional language filter for the session
    language_filter: { type: String },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
);

// Indexes for efficient queries
AnnotationSession.index({ user_id: 1, status: 1 });
AnnotationSession.index({ user_id: 1, created_at: -1 });
AnnotationSession.index({ annotated_sentence_ids: 1 });
AnnotationSession.index({ exported_sentence_ids: 1 });

export interface IAnnotationSession extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  user_id: mongoose.Types.ObjectId;
  status: SessionStatus;
  annotated_sentence_ids: mongoose.Types.ObjectId[];
  exported_sentence_ids: mongoose.Types.ObjectId[];
  total_annotated: number;
  total_exported: number;
  started_at: Date;
  last_activity_at: Date;
  completed_at?: Date;
  exports: Array<{
    exported_at: Date;
    exported_by: mongoose.Types.ObjectId;
    sentence_count: number;
    file_name: string;
    download_url?: string;
  }>;
  language_filter?: string;
  created_at: Date;
  updated_at: Date;
}
