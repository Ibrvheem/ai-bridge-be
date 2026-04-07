import * as mongoose from 'mongoose';
import { createObjectCsvStringifier } from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';

// Load .env manually (no dotenv dependency)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set in .env');
  process.exit(1);
}

// Define a minimal schema matching the sentences collection
const SentenceSchema = new mongoose.Schema({}, { strict: false });

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  console.log('Connected.');

  const db = mongoose.connection.db;

  // List collections to verify the collection name
  const collections = await db.listCollections().toArray();
  console.log('Collections:', collections.map((c) => c.name).join(', '));

  const Sentence = mongoose.model('Sentence', SentenceSchema, 'sentences');

  // Quick check
  console.log('Quick count...');
  const totalCount = await Sentence.estimatedDocumentCount();
  console.log(`Estimated total sentences: ${totalCount}`);

  // Fetch all annotated sentences using cursor to avoid memory/timeout issues
  console.log('Fetching annotated sentences...');
  const query = {
    target_gender: { $exists: true, $ne: null },
    bias_label: { $exists: true, $ne: null },
    explicitness: { $exists: true, $ne: null },
  };

  const count = await Sentence.countDocuments(query);
  console.log(`Found ${count} annotated sentences.`);

  if (count === 0) {
    console.log('No annotated sentences found. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const sentences: any[] = [];
  const cursor = Sentence.find(query).lean().cursor({ batchSize: 500 });
  let fetched = 0;
  for await (const doc of cursor) {
    sentences.push(doc);
    fetched++;
    if (fetched % 1000 === 0) {
      console.log(`  Fetched ${fetched}/${count}...`);
    }
  }
  console.log(`Fetched all ${sentences.length} sentences.`);

  // Build CSV
  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: '_id', title: 'sentence_id' },
      { id: 'language', title: 'language' },
      { id: 'script', title: 'script' },
      { id: 'country', title: 'country' },
      { id: 'region_dialect', title: 'region_dialect' },
      { id: 'source_type', title: 'source_type' },
      { id: 'source_ref', title: 'source_ref' },
      { id: 'collection_date', title: 'collection_date' },
      { id: 'text', title: 'text' },
      { id: 'domain', title: 'domain' },
      { id: 'topic', title: 'topic' },
      { id: 'theme', title: 'theme' },
      { id: 'sensitive_characteristic', title: 'sensitive_characteristic' },
      { id: 'safety_flag', title: 'safety_flag' },
      { id: 'pii_removed', title: 'pii_removed' },
      { id: 'target_gender', title: 'target_gender' },
      { id: 'bias_label', title: 'bias_label' },
      { id: 'explicitness', title: 'explicitness' },
      { id: 'stereotype_category', title: 'stereotype_category' },
      { id: 'sentiment_toward_referent', title: 'sentiment_toward_referent' },
      { id: 'device', title: 'device' },
      { id: 'qa_status', title: 'qa_status' },
      { id: 'annotation_date', title: 'annotation_date' },
      { id: 'annotation_time_seconds', title: 'annotation_time_seconds' },
      { id: 'document_id', title: 'document_id' },
      { id: 'exported_at', title: 'exported_at' },
      { id: 'notes', title: 'notes' },
      { id: 'review_notes', title: 'review_notes' },
      { id: 'collector_id', title: 'collector_id' },
      { id: 'annotator_id', title: 'annotator_id' },
    ],
  });

  const records = sentences.map((s: any) => ({
    _id: s._id?.toString() || '',
    language: s.language || '',
    script: s.script || '',
    country: s.country || '',
    region_dialect: s.region_dialect || '',
    source_type: s.source_type || '',
    source_ref: s.source_ref || '',
    collection_date: s.collection_date
      ? new Date(s.collection_date).toISOString()
      : '',
    text: s.text || '',
    domain: s.domain || '',
    topic: s.topic || '',
    theme: s.theme || '',
    sensitive_characteristic: s.sensitive_characteristic || '',
    safety_flag: s.safety_flag || '',
    pii_removed: s.pii_removed?.toString() || '',
    target_gender: s.target_gender || '',
    bias_label: s.bias_label || '',
    explicitness: s.explicitness || '',
    stereotype_category: s.stereotype_category || '',
    sentiment_toward_referent: s.sentiment_toward_referent || '',
    device: s.device || '',
    qa_status: s.qa_status || '',
    annotation_date: s.annotation_date
      ? new Date(s.annotation_date).toISOString()
      : '',
    annotation_time_seconds: s.annotation_time_seconds?.toString() || '',
    document_id: s.document_id || '',
    exported_at: s.exported_at ? new Date(s.exported_at).toISOString() : '',
    notes: s.notes || '',
    review_notes: s.review_notes || '',
    collector_id: s.collector_id?.toString() || '',
    annotator_id: s.annotator_id?.toString() || '',
  }));

  const csvContent =
    csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

  // Write to exports/ directory
  const exportsDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(
    exportsDir,
    `annotated-sentences-${timestamp}.csv`,
  );

  fs.writeFileSync(outputFile, csvContent, 'utf-8');
  console.log(`Exported ${sentences.length} sentences to ${outputFile}`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
