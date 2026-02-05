import mongoose from 'mongoose';
import {
  Script,
  SourceType,
  Domain,
  Theme,
  SensitiveCharacteristic,
  SafetyFlag,
  TargetGender,
  BiasLabel,
  Explicitness,
  StereotypeCategory,
  SentimentTowardReferent,
  Device,
  QAStatus,
} from './types/data-collection.types';

export const Sentences = new mongoose.Schema(
  {
    // === Data Collection Fields ===
    language: { type: String, required: true },
    script: {
      type: String,
      enum: Object.values(Script),
      default: Script.LATIN,
    },
    country: { type: String, required: true },
    region_dialect: { type: String },
    source_type: {
      type: String,
      enum: Object.values(SourceType),
      required: true,
    },
    source_ref: { type: String },
    collection_date: { type: Date, default: Date.now },
    text: { type: String, required: true },
    domain: {
      type: String,
      enum: Object.values(Domain),
      required: true,
    },
    topic: { type: String },
    theme: {
      type: String,
      enum: Object.values(Theme),
      required: true,
    },
    sensitive_characteristic: {
      type: String,
      enum: [...Object.values(SensitiveCharacteristic), null],
      default: null,
    },
    safety_flag: {
      type: String,
      enum: Object.values(SafetyFlag),
      default: SafetyFlag.SAFE,
    },
    pii_removed: { type: Boolean, default: false },
    collector_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: { type: String },

    // === Annotation Fields ===
    target_gender: {
      type: String,
      enum: [...Object.values(TargetGender), null],
      default: null,
    },
    bias_label: {
      type: String,
      enum: [...Object.values(BiasLabel), null],
      default: null,
    },
    explicitness: {
      type: String,
      enum: [...Object.values(Explicitness), null],
      default: null,
    },
    stereotype_category: {
      type: String,
      enum: [...Object.values(StereotypeCategory), null],
      default: null,
    },
    sentiment_toward_referent: {
      type: String,
      enum: [...Object.values(SentimentTowardReferent), null],
      default: null,
    },
    device: {
      type: String,
      enum: [...Object.values(Device), null],
      default: null,
    },
    annotator_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    annotation_date: { type: Date },
    qa_status: {
      type: String,
      enum: [...Object.values(QAStatus), null],
      default: null,
    },
    annotation_time_seconds: { type: Number },
    document_id: { type: String }, // Track which upload batch this sentence belongs to
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

// Indexes for performance
Sentences.index({ text: 1, source_ref: 1 });
Sentences.index({ language: 1 });
Sentences.index({ domain: 1 });
Sentences.index({ theme: 1 });
Sentences.index({ safety_flag: 1 });
Sentences.index({ bias_label: 1 });
Sentences.index({ qa_status: 1 });
Sentences.index({ annotator_id: 1 });
Sentences.index({ collector_id: 1 });
Sentences.index({ created_at: -1 });

export interface Sentences {
  id: string;
  language: string;
  script: string;
  country: string;
  region_dialect?: string;
  source_type: string;
  source_ref?: string;
  collection_date: Date;
  text: string;
  domain: string;
  topic?: string;
  theme: string;
  sensitive_characteristic?: string | null;
  safety_flag: string;
  pii_removed: boolean;
  collector_id: string;
  notes?: string | null;
  target_gender?: string | null;
  bias_label?: string | null;
  explicitness?: string | null;
  stereotype_category?: string | null;
  sentiment_toward_referent?: string | null;
  device?: string | null;
  annotator_id?: string;
  annotation_date?: Date;
  qa_status?: string | null;
  annotation_time_seconds?: number;
  document_id?: string;
  created_at: Date;
  updated_at: Date;
}
