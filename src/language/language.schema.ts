import mongoose from 'mongoose';

export const LanguageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  native_name: { type: String, required: true },
  code: { type: String, unique: true },
  isActive: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export interface Language {
  id: string;
  name: string;
  code: string;
  native_name: string;
  isActive: string;
  created_at: string;
  updated_at: string;
}
