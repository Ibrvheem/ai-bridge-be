import mongoose from 'mongoose';

export const AnnotationExport = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sentence_count: { type: Number, required: true },
    file_name: { type: String, required: true },
    s3_key: { type: String, required: true },
    download_url: { type: String },
    exported_sentence_ids: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Sentences' },
    ],
    exported_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

// Index for finding exports by user
AnnotationExport.index({ user_id: 1, exported_at: -1 });

export interface IAnnotationExport {
  _id: string;
  user_id: string;
  sentence_count: number;
  file_name: string;
  s3_key: string;
  download_url?: string;
  exported_sentence_ids: string[];
  exported_at: Date;
  created_at: Date;
  updated_at: Date;
}
