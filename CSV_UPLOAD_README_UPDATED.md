# CSV/XLSX Upload Implementation for Sentences

This implementation provides a complete solution for uploading CSV/XLSX files, storing them in S3, and saving the sentence data to your MongoDB database. Each upload is assigned a unique document ID for easy batch management.

## Features

✅ **File Upload to S3**: Automatically uploads CSV/XLSX files to your S3 bucket  
✅ **CSV/XLSX Parsing**: Supports both CSV and Excel file formats  
✅ **Bulk Database Insert**: Efficiently inserts multiple sentences with error handling  
✅ **Document ID Tracking**: Each upload gets a unique document ID for batch operations  
✅ **Data Validation**: Validates file format and required fields  
✅ **Error Handling**: Graceful handling of duplicates and validation errors  
✅ **Template Download**: Provides a CSV template for users  
✅ **Batch Operations**: Query, update, or delete sentences by document ID

## API Endpoints

### 1. Upload CSV/XLSX File

```
POST /sentences/upload-csv
Content-Type: multipart/form-data
Authorization: Bearer <your-jwt-token>

Body:
- file: CSV or XLSX file
```

**Response:**

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
    "totalSentences": 100,
    "insertedCount": 95,
    "success": true,
    "errors": [
      {
        "index": 45,
        "error": "Duplicate bias_category"
      }
    ]
  }
}
```

### 2. Download CSV Template

```
GET /sentences/csv-template
```

Downloads a sample CSV file with the correct column headers.

### 3. Document Management

#### Get All Document IDs

```
GET /sentences/documents
```

Returns array of all document IDs.

#### Get Document Statistics

```
GET /sentences/documents/stats
```

Returns aggregated statistics for each document upload.

**Response:**

```json
[
  {
    "_id": "550e8400-e29b-41d4-a716-446655440000",
    "count": 95,
    "languages": ["en", "es"],
    "bias_categories": ["gender", "racial", "age"],
    "created_at": "2024-10-04T10:30:00Z"
  }
]
```

#### Get Sentences by Document ID

```
GET /sentences/by-document/:documentId
```

Returns all sentences from a specific upload.

#### Delete All Sentences by Document ID

```
DELETE /sentences/documents/:documentId
```

Deletes all sentences from a specific upload.

### 4. Bulk Create Sentences (JSON)

```
POST /sentences/bulk
Content-Type: application/json

Body:
{
  "sentences": [
    {
      "sentence": "Example sentence",
      "original_content": "Original text",
      "bias_category": "gender",
      "language": "en"
    }
  ],
  "document_id": "optional-custom-document-id"
}
```

### 5. Query Sentences

```
GET /sentences                        # Get all sentences
GET /sentences/by-category/:category  # Filter by bias category
GET /sentences/by-language/:language  # Filter by language
GET /sentences/:id                    # Get specific sentence
```

## CSV/XLSX File Format

Your CSV/XLSX files should have the following columns:

| Column             | Required | Description                       |
| ------------------ | -------- | --------------------------------- |
| `sentence`         | ✅ Yes   | The main sentence text            |
| `original_content` | ❌ No    | Original content (can be empty)   |
| `bias_category`    | ✅ Yes   | Category of bias (must be unique) |
| `language`         | ❌ No    | Language code (defaults to 'en')  |

**Example CSV:**

```csv
sentence,original_content,bias_category,language
"This is a sample sentence.","Original content here","gender","en"
"Another example sentence.","More original content","racial","en"
"Third example.","Original text","age","es"
```

## How It Works

1. **File Upload**: User uploads a CSV/XLSX file via the `/sentences/upload-csv` endpoint
2. **Document ID Generation**: System generates a unique UUID for this upload batch
3. **File Validation**: System validates file type and checks for required columns
4. **S3 Storage**: Original file is uploaded to S3 with path: `{userId}/csv-uploads/{documentId}-{filename}`
5. **Data Parsing**: File content is parsed and validated according to the schema
6. **Document ID Assignment**: Each parsed sentence gets the generated document_id
7. **Database Insert**: Valid sentences are bulk inserted into MongoDB with duplicate handling
8. **Response**: Detailed response with document ID, upload status and processing results

## Document ID Benefits

- **Batch Management**: Easily identify which sentences came from which upload
- **Bulk Operations**: Query, update, or delete entire uploads at once
- **Audit Trail**: Track file upload history and processing results
- **File Linking**: S3 file path includes document ID for easy correlation
- **Error Recovery**: Can easily remove and re-upload problematic files

## Usage Examples

### Using cURL

```bash
# Upload a CSV file
curl -X POST \
  http://localhost:3000/sentences/upload-csv \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -F 'file=@sentences.csv'

# Get sentences from specific upload
curl -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  http://localhost:3000/sentences/by-document/550e8400-e29b-41d4-a716-446655440000

# Delete entire upload batch
curl -X DELETE \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  http://localhost:3000/sentences/documents/550e8400-e29b-41d4-a716-446655440000

# Download template
curl -O http://localhost:3000/sentences/csv-template
```

### Using JavaScript (Frontend)

```javascript
const formData = new FormData();
formData.append('file', csvFile);

const response = await fetch('/sentences/upload-csv', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});

const result = await response.json();
console.log('Upload result:', result);
console.log('Document ID:', result.document_id);

// Later, get sentences from this upload
const sentences = await fetch(`/sentences/by-document/${result.document_id}`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

## Database Schema

The sentences are stored in MongoDB with this schema:

```javascript
{
  sentence: String,           // Required
  original_content: String,   // Optional
  bias_category: String,      // Required, unique
  language: String,           // Optional, defaults to 'en'
  document_id: String,        // Generated UUID for upload tracking
  created_at: Date,          // Auto-generated
  updated_at: Date           // Auto-generated
}
```

## Error Handling

- **Invalid File Type**: Returns 400 if file is not CSV or XLSX
- **Missing Required Fields**: Skips rows with missing sentence or bias_category
- **Duplicate bias_category**: Handles duplicates gracefully (since it's marked as unique in schema)
- **Parsing Errors**: Returns detailed error messages for file parsing issues
- **Document Not Found**: Returns appropriate errors for invalid document IDs

## File Size Considerations

- The implementation handles files in memory, so consider adding file size limits for production
- For very large files, consider implementing streaming or chunked processing
- Current implementation uses `{ ordered: false }` for better performance with duplicates

## Environment Variables Required

Make sure these S3 configuration variables are set:

- `R2_ENDPONT`
- `R2_REGION`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Dependencies Added

```json
{
  "csv-parser": "^3.0.0",
  "xlsx": "^0.18.5"
}
```
