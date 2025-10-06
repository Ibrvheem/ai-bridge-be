# CSV Upload Performance Analysis & Optimizations

## Current Performance Issues

### 1. Sequential Duplicate Detection (Critical Issue)

**Problem**: Each sentence is checked individually in a loop

```typescript
// Current inefficient approach
for (let i = 0; i < sentences.length; i++) {
  const duplicateCheck = await this.checkForDuplicate(
    sentence,
    originalContent,
  );
  // This creates N database queries for N sentences
}
```

**Impact**: 1000 sentences = 1000 database queries = 3-10 seconds

### 2. Missing Database Indexes

**Problem**: No indexes on duplicate detection fields

```typescript
// Current query without index
const existingSentence = await this.sentenceModel
  .findOne({
    sentence: sentence.trim(),
    original_content: originalContent?.trim() || '',
  })
  .exec();
```

**Impact**: Full collection scan for each query

### 3. Single Request Processing

**Problem**: Entire file processed in one HTTP request
**Impact**: Timeouts for large files, poor UX

## Recommended Optimizations

### 1. Batch Duplicate Detection (Priority 1)

Replace sequential checks with bulk operations:

```typescript
// Optimized approach - single query for all duplicates
async bulkCheckDuplicates(sentences: CreateSentenceDto[]): Promise<Map<string, string>> {
    const searchCriteria = sentences.map(s => ({
        sentence: s.sentence.trim(),
        original_content: s.original_content?.trim() || ''
    }));

    const existingDuplicates = await this.sentenceModel.find({
        $or: searchCriteria
    }).select('sentence original_content document_id').exec();

    // Create lookup map for O(1) duplicate detection
    const duplicateMap = new Map<string, string>();
    existingDuplicates.forEach(doc => {
        const key = `${doc.sentence}|${doc.original_content}`;
        duplicateMap.set(key, doc.document_id);
    });

    return duplicateMap;
}
```

### 2. Add Database Indexes (Priority 1)

```typescript
// Add to sentences.schema.ts
Sentences.index({ sentence: 1, original_content: 1 }, { unique: false });
Sentences.index({ document_id: 1 });
Sentences.index({ created_at: -1 });
```

### 3. Stream Processing for Large Files (Priority 2)

```typescript
async parseStreamCsv(buffer: Buffer, batchSize: number = 100): Promise<AsyncGenerator<CreateSentenceDto[], void, unknown>> {
    const stream = Readable.from(buffer);
    let batch: CreateSentenceDto[] = [];

    return new Promise((resolve, reject) => {
        const generator = async function* () {
            // Yield batches as they're processed
        };
        resolve(generator());
    });
}
```

### 4. Background Job Processing (Priority 2)

```typescript
// Queue large uploads for background processing
@Post('upload-csv-async')
async uploadCsvAsync(@UploadedFile() file: Express.Multer.File, @User() user: any) {
    const jobId = uuidv4();

    // Store file in S3 first
    const s3Key = await this.uploadService.uploadToS3(file.buffer, file.originalname);

    // Queue for background processing
    await this.queueService.addCsvProcessingJob({
        jobId,
        s3Key,
        userId: user.id,
        filename: file.originalname
    });

    return { jobId, status: 'queued' };
}
```

## Performance Benchmarks (Estimated)

| File Size | Sentences | Current Time | Optimized Time | Improvement |
| --------- | --------- | ------------ | -------------- | ----------- |
| 1MB       | 1,000     | 8-15 sec     | 1-2 sec        | 7x faster   |
| 10MB      | 10,000    | 80-150 sec   | 5-8 sec        | 18x faster  |
| 50MB      | 50,000    | Timeout      | 15-25 sec      | Works       |
| 100MB     | 100,000   | Timeout      | 30-45 sec      | Works       |

## Implementation Priority

### Phase 1 (Immediate - High Impact)

1. ✅ Add database indexes
2. ✅ Implement bulk duplicate detection
3. ✅ Optimize insertMany operations

### Phase 2 (Medium Term)

1. 🔄 Stream processing for large files
2. 🔄 Background job queue
3. 🔄 Progress tracking API

### Phase 3 (Long Term)

1. ⏳ Redis caching for frequent duplicates
2. ⏳ Database partitioning by document_id
3. ⏳ Compression for stored content

## Quick Wins Implementation

The following changes can be implemented immediately for 5-10x performance improvement:

1. **Add Indexes** (2 minutes)
2. **Bulk Duplicate Detection** (30 minutes)
3. **Optimize insertMany** (15 minutes)

Total implementation time: ~45 minutes for major performance gains.
