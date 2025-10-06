import mongoose from 'mongoose';

export const Sentences = new mongoose.Schema({
  sentence: { type: String, required: true },
  original_content: { type: String },
  bias_category: { type: String },
  language: { type: String },
  document_id: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Critical indexes for performance
Sentences.index({ sentence: 1, original_content: 1 }); // For duplicate detection
Sentences.index({ document_id: 1 }); // For document-based queries
Sentences.index({ created_at: -1 }); // For time-based queries

export interface Sentences {
  id: string;
  sentence: string;
  original_content?: string;
  bias_category?: string;
  language?: string;
  document_id?: string;
  created_at: string;
  updated_at: string;
}
