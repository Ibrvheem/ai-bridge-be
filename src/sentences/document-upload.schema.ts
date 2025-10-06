import mongoose from 'mongoose';

export const DocumentUpload = new mongoose.Schema({
    document_id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true },
    original_filename: { type: String, required: true },
    s3_key: { type: String, required: true },
    file_size: { type: Number },
    mime_type: { type: String },
    total_rows: { type: Number, required: true },
    successful_inserts: { type: Number, required: true },
    failed_inserts: { type: Number, default: 0 },
    duplicate_count: { type: Number, default: 0 },
    duplicates: [{
        sentence: String,
        original_content: String,
        existing_document_id: String,
        row_number: Number
    }],
    errors: [{
        row_number: Number,
        error: String
    }],
    processing_time_ms: { type: Number },
    status: {
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing'
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export interface DocumentUpload {
    id: string;
    document_id: string;
    user_id: string;
    original_filename: string;
    s3_key: string;
    file_size?: number;
    mime_type?: string;
    total_rows: number;
    successful_inserts: number;
    failed_inserts: number;
    duplicate_count: number;
    duplicates: Array<{
        sentence: string;
        original_content: string;
        existing_document_id: string;
        row_number: number;
    }>;
    errors: Array<{
        row_number: number;
        error: string;
    }>;
    processing_time_ms?: number;
    status: 'processing' | 'completed' | 'failed';
    created_at: Date;
    updated_at: Date;
}