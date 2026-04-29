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

const EmptySchema = new mongoose.Schema({}, { strict: false });

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  console.log('Connected.');

  const Sentence = mongoose.model('Sentence', EmptySchema, 'sentences');

  const total = await Sentence.countDocuments({ qa_status: 'accepted' });
  console.log(`Found ${total} approved sentences.`);

  if (total === 0) {
    console.log('No approved sentences found. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Fetch all approved sentences (sort in JS so uncategorized lands last)
  const sentences: any[] = [];
  const cursor = Sentence.find({ qa_status: 'accepted' })
    .lean()
    .cursor({ batchSize: 500 });

  let fetched = 0;
  for await (const doc of cursor) {
    sentences.push(doc);
    fetched++;
    if (fetched % 1000 === 0) console.log(`  Fetched ${fetched}/${total}...`);
  }

  // Sort: alphabetical by category, uncategorized/null last
  sentences.sort((a, b) => {
    const catA = a.stereotype_category || '￿';
    const catB = b.stereotype_category || '￿';
    return catA.localeCompare(catB);
  });

  // Build category summary
  const categoryCounts = new Map<string, number>();
  for (const s of sentences) {
    const cat = (s as any).stereotype_category || 'uncategorized';
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }
  const sorted = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);

  console.log('\n--- stereotype_category distribution (approved sentences) ---\n');
  console.log('Category'.padEnd(30) + 'Count'.padEnd(10) + 'Percentage');
  console.log('-'.repeat(55));
  for (const [cat, count] of sorted) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(cat.padEnd(30) + String(count).padEnd(10) + `${pct}%`);
  }
  console.log('-'.repeat(55));
  console.log('TOTAL'.padEnd(30) + String(total));

  // Build CSV (sentences grouped by stereotype_category)
  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: 'stereotype_category', title: 'stereotype_category' },
      { id: '_id', title: 'sentence_id' },
      { id: 'text', title: 'text' },
      { id: 'language', title: 'language' },
      { id: 'script', title: 'script' },
      { id: 'country', title: 'country' },
      { id: 'region_dialect', title: 'region_dialect' },
      { id: 'source_type', title: 'source_type' },
      { id: 'source_ref', title: 'source_ref' },
      { id: 'collection_date', title: 'collection_date' },
      { id: 'domain', title: 'domain' },
      { id: 'topic', title: 'topic' },
      { id: 'theme', title: 'theme' },
      { id: 'sensitive_characteristic', title: 'sensitive_characteristic' },
      { id: 'safety_flag', title: 'safety_flag' },
      { id: 'pii_removed', title: 'pii_removed' },
      { id: 'target_gender', title: 'target_gender' },
      { id: 'bias_label', title: 'bias_label' },
      { id: 'explicitness', title: 'explicitness' },
      { id: 'sentiment_toward_referent', title: 'sentiment_toward_referent' },
      { id: 'device', title: 'device' },
      { id: 'qa_status', title: 'qa_status' },
      { id: 'annotation_date', title: 'annotation_date' },
      { id: 'annotation_time_seconds', title: 'annotation_time_seconds' },
      { id: 'document_id', title: 'document_id' },
      { id: 'notes', title: 'notes' },
      { id: 'review_notes', title: 'review_notes' },
      { id: 'collector_id', title: 'collector_id' },
      { id: 'annotator_id', title: 'annotator_id' },
    ],
  });

  const records = sentences.map((s: any) => ({
    stereotype_category: s.stereotype_category || 'uncategorized',
    _id: s._id?.toString() || '',
    text: s.text || '',
    language: s.language || '',
    script: s.script || '',
    country: s.country || '',
    region_dialect: s.region_dialect || '',
    source_type: s.source_type || '',
    source_ref: s.source_ref || '',
    collection_date: s.collection_date ? new Date(s.collection_date).toISOString() : '',
    domain: s.domain || '',
    topic: s.topic || '',
    theme: s.theme || '',
    sensitive_characteristic: s.sensitive_characteristic || '',
    safety_flag: s.safety_flag || '',
    pii_removed: s.pii_removed?.toString() || '',
    target_gender: s.target_gender || '',
    bias_label: s.bias_label || '',
    explicitness: s.explicitness || '',
    sentiment_toward_referent: s.sentiment_toward_referent || '',
    device: s.device || '',
    qa_status: s.qa_status || '',
    annotation_date: s.annotation_date ? new Date(s.annotation_date).toISOString() : '',
    annotation_time_seconds: s.annotation_time_seconds?.toString() || '',
    document_id: s.document_id || '',
    notes: s.notes || '',
    review_notes: s.review_notes || '',
    collector_id: s.collector_id?.toString() || '',
    annotator_id: s.annotator_id?.toString() || '',
  }));

  const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

  const exportsDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(exportsDir, `stereotype-category-distribution-${timestamp}.csv`);

  fs.writeFileSync(outputFile, csvContent, 'utf-8');
  console.log(`\nExported ${sentences.length} sentences to: ${outputFile}`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
