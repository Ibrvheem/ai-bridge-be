import mongoose from 'mongoose';
import { USER_TYPE } from './types';

export const UserSchema = new mongoose.Schema({
  email: { type: String, required: true },
  password: { type: String },
  type: { type: String, enum: USER_TYPE, default: USER_TYPE.annotator },

});

export interface User {
  id: string;
  email: string;
  password: string;
  type: USER_TYPE;
  created_at: string;
  updated_at: string;
}
