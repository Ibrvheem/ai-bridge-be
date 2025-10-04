import mongoose from 'mongoose';

export const Sentences = new mongoose.Schema({
  sentence: { type: String, },
  original_content: { type: String, },
  bias_category: { type: String, unique: true },
  language: { type: String, },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export interface Sentences {
  id: string;
  sentence: string;
  original_content: string;
  bias_category: string;
  language: string;
  created_at: string;
  updated_at: string;
}
