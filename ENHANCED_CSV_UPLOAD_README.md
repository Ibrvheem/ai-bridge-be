# Enhanced CSV/XLSX Upload with Duplicate Det "errors": [

    {
      "row_number": 23,
      "error": "Missing required field: sentence"
    }

],& Document Tracking

This implementation provides a comprehensive solution for uploading CSV/XLSX files with advanced duplicate detection, document tracking, and detailed logging capabilities.

## 🚀 Key Features

✅ **Simplified Upload**: Only requires `sentence` and `original_content` during upload  
✅ **Annotation Workflow**: Fields like `bias_category` and `language` are set during annotation  
✅ **Duplicate Detection**: Identifies and logs duplicate sentences and original content  
✅ **Document Tracking**: Complete audit trail for all uploads  
✅ **Processing Analytics**: Detailed statistics and reports  
✅ **Error Logging**: Comprehensive error tracking and reporting  
✅ **User-based Data**: All tracking is user-specific for multi-tenant support

## 📊 API Endpoints

### File Upload & Processing

#### Upload CSV/XLSX with Duplicate Detection\n\n`http\nPOST /sentences/upload-csv\nContent-Type: multipart/form-data\nAuthorization: Bearer <your-jwt-token>\n\nBody:\n- file: CSV or XLSX file\n`\n\n#### Download CSV Template\n\n`http\nGET /sentences/csv-template\n`\n\nDownloads a sample CSV file with the correct column headers (`sentence,original_content`).\n\n#### Bulk Create Sentences (JSON)\n\n`http\nPOST /sentences/bulk\nContent-Type: application/json\nAuthorization: Bearer <your-jwt-token>\n\nBody:\n{\n  \"sentences\": [\n    {\n      \"sentence\": \"Example sentence\",\n      \"original_content\": \"Original text\"\n    }\n  ],\n  \"document_id\": \"optional-custom-document-id\",\n  \"language\": \"optional-language-code\"\n}\n`\n\n**Enhanced Response:**

```json
{
  "message": "File processed successfully",
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "file": {
    "originalName": "sentences.csv",
    "s3Key": "userId123/csv-uploads/550e8400-e29b-41d4-a716-446655440000-sentences.csv",
    "uploadSuccess": true
  },
  "processing": {
    "totalRows": 100,
    "successfulInserts": 85,
    "duplicatesFound": 12,
    "errorsFound": 3,
    "processingTimeMs": 1250,
    "success": true
  },
  "duplicates": [
    {
      "sentence": "This is a duplicate sentence",
      "original_content": "Original content",
      "existing_document_id": "previous-doc-id-123",
      "row_number": 45
    }
  ],
  "errors": [
    {
      "row_number": 23,
      "error": "Missing required field: sentence"
    }
  ]
}
```

### Document Management & Analytics

#### Get Upload History

```http
GET /sentences/upload-history
Authorization: Bearer <your-jwt-token>
```

Returns all document uploads for the authenticated user.

#### Get Upload Statistics

```http
GET /sentences/upload-stats
Authorization: Bearer <your-jwt-token>
```

**Response:**

```json
[
  {
    "_id": null,
    "total_documents": 15,
    "total_sentences_processed": 1500,
    "total_successful_inserts": 1350,
    "total_duplicates": 120,
    "total_errors": 30,
    "completed_uploads": 14,
    "failed_uploads": 1,
    "processing_uploads": 0
  }
]
```

#### Get Duplicate Report

```http
GET /sentences/duplicate-report
Authorization: Bearer <your-jwt-token>
```

Returns documents with duplicate findings, sorted by duplicate count.

#### Get Processing History (30 days)

```http
GET /sentences/processing-history
Authorization: Bearer <your-jwt-token>
```

Returns daily processing statistics for the last 30 days.

#### Get Detailed Upload Information

```http
GET /sentences/upload-details/:documentId
Authorization: Bearer <your-jwt-token>
```

Returns complete details about a specific upload including all duplicates and errors.

### Document Operations

#### Get Sentences by Document ID

```http
GET /sentences/by-document/:documentId
Authorization: Bearer <your-jwt-token>
```

#### Delete All Sentences by Document ID

```http
DELETE /sentences/documents/:documentId
Authorization: Bearer <your-jwt-token>
```

## 🔍 Duplicate Detection Logic

### How Duplicates are Identified

- **Exact Match**: Sentence + Original Content combination must match exactly
- **Case & Whitespace Sensitive**: Trimmed for comparison but preserves original formatting
- **Cross-Document Detection**: Finds duplicates across all previous uploads
- **Row-Level Tracking**: Records exactly which row contained the duplicate

### Duplicate Processing Flow

1. **Parse File**: Extract all rows from CSV/XLSX
2. **Validate Fields**: Check for required fields (only sentence is required)
3. **Check Duplicates**: For each valid row, check against existing database records
4. **Log Findings**: Record duplicate details including source document
5. **Insert Valid**: Only insert non-duplicate, valid sentences
6. **Generate Report**: Provide detailed breakdown of processing results

## 📋 Database Schemas

### Enhanced Sentences Schema

```javascript
{
  sentence: String,           // Required
  original_content: String,   // Optional
  bias_category: String,      // Optional (set during annotation)
  language: String,           // Optional (set during annotation)
  document_id: String,        // Generated UUID for upload tracking
  created_at: Date,          // Auto-generated
  updated_at: Date           // Auto-generated
}
```

### Document Upload Tracking Schema

```javascript
{
  document_id: String,        // Unique identifier for upload
  user_id: String,           // User who uploaded the document
  original_filename: String, // Original file name
  s3_key: String,           // S3 storage path
  file_size: Number,        // File size in bytes
  mime_type: String,        // File MIME type
  total_rows: Number,       // Total rows in uploaded file
  successful_inserts: Number, // Successfully inserted sentences
  failed_inserts: Number,   // Failed insertions due to errors
  duplicate_count: Number,  // Number of duplicates found
  duplicates: [{            // Detailed duplicate information
    sentence: String,
    original_content: String,
    existing_document_id: String,
    row_number: Number
  }],
  errors: [{               // Processing errors
    row_number: Number,
    error_message: String,
    row_data: Mixed
  }],
  processing_time_ms: Number, // Processing duration
  status: String,           // 'processing', 'completed', 'failed'
  created_at: Date,
  updated_at: Date
}
```

## 📈 Usage Examples

### Upload with Duplicate Checking

```javascript
const formData = new FormData();
formData.append('file', csvFile);

const response = await fetch('/sentences/upload-csv', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});

const result = await response.json();

console.log(`Processed ${result.processing.totalRows} rows`);
console.log(`Inserted ${result.processing.successfulInserts} new sentences`);
console.log(`Found ${result.processing.duplicatesFound} duplicates`);
console.log(`Encountered ${result.processing.errorsFound} errors`);

// Handle duplicates
result.duplicates.forEach((dup) => {
  console.log(
    `Row ${dup.row_number}: "${dup.sentence}" already exists in document ${dup.existing_document_id}`,
  );
});
```

### Get Upload Analytics

```javascript
// Get user's upload statistics
const stats = await fetch('/sentences/upload-stats', {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

console.log(`Total uploads: ${stats[0].total_documents}`);
console.log(
  `Success rate: ${((stats[0].total_successful_inserts / stats[0].total_sentences_processed) * 100).toFixed(2)}%`,
);
console.log(
  `Duplicate rate: ${((stats[0].total_duplicates / stats[0].total_sentences_processed) * 100).toFixed(2)}%`,
);
```

### Review Duplicate Report

```javascript
const duplicateReport = await fetch('/sentences/duplicate-report', {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

duplicateReport.forEach((doc) => {
  console.log(
    `${doc.original_filename}: ${doc.duplicate_count} duplicates found`,
  );
  doc.duplicates.forEach((dup) => {
    console.log(`  Row ${dup.row_number}: "${dup.sentence}"`);
  });
});
```

## 🛠 Benefits of Enhanced System

### For Data Quality

- **No Duplicate Data**: Prevents database pollution with duplicate entries
- **Audit Trail**: Complete tracking of data sources and processing results
- **Error Recovery**: Easy identification and resolution of data issues
- **Quality Metrics**: Detailed statistics on data quality and processing success

### For Operations

- **Batch Management**: Easy tracking and management of uploaded batches
- **Performance Monitoring**: Processing time and success rate tracking
- **User Analytics**: Per-user statistics and history
- **Debugging Support**: Detailed error logs for troubleshooting

### For Compliance

- **Data Lineage**: Track where each sentence came from
- **Processing History**: Complete audit log of all operations
- **User Attribution**: Know who uploaded what data
- **Error Documentation**: Detailed record of all processing issues

## 🔧 Installation & Setup

### Dependencies Required

```json
{
  "csv-parser": "^3.0.0",
  "xlsx": "^0.18.5",
  "uuid": "^9.0.0"
}
```

### Environment Variables

```env
R2_ENDPOINT=your-s3-endpoint
R2_REGION=your-region
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
```

## 📝 CSV File Format

Expected columns in your CSV/XLSX files:

| Column             | Required | Description                                      |
| ------------------ | -------- | ------------------------------------------------ |
| `sentence`         | ✅ Yes   | The sentence text (used for duplicate detection) |
| `original_content` | ❌ No    | Original content (used for duplicate detection)  |

**Optional columns (will be set during annotation):**

- `bias_category` - Category of bias (set during annotation)
- `language` - Language code (set during annotation)

**Example CSV:**

```csv
sentence,original_content
"First sentence example","Original content 1"
"Second sentence example","Original content 2"
"First sentence example","Original content 1"
```

☝️ Row 3 would be detected as a duplicate of row 1 (same sentence + original_content)

This enhanced system provides complete visibility into your data processing pipeline with robust duplicate detection and comprehensive tracking capabilities.
