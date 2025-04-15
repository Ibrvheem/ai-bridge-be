import mongoose from 'mongoose';

export const BlogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  photo: { type: String },
  created_at: { type: Date },
  updated_at: { type: Date },
});

export interface Blog {
  id: string;
  title: string;
  cotent: string;
  photo: string;
  created_at: string;
  updated_at: string;
}
