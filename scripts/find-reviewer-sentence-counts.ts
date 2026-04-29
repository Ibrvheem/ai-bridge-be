import * as mongoose from 'mongoose';
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
  const User = mongoose.model('User', EmptySchema, 'users');

  // Source of truth: sentences.review_history records every accept/reject action.
  // Deduplicate by sentence text (not _id) to catch cases where the same sentence
  // was stored as multiple documents with different IDs.
  const agg = await Sentence.aggregate([
    { $match: { 'review_history.0': { $exists: true }, text: { $exists: true } } },
    { $unwind: '$review_history' },
    { $match: { 'review_history.action': { $in: ['accepted', 'rejected'] } } },
    {
      $group: {
        _id: {
          reviewer: '$review_history.user_id',
          text: { $trim: { input: { $toLower: '$text' } } },
        },
        // last action this reviewer took on this exact text
        action: { $last: '$review_history.action' },
      },
    },
    {
      $group: {
        _id: '$_id.reviewer',
        unique_sentences: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ['$action', 'accepted'] }, 1, 0] },
        },
        rejected: {
          $sum: { $cond: [{ $eq: ['$action', 'rejected'] }, 1, 0] },
        },
      },
    },
    { $sort: { unique_sentences: -1 } },
  ]);

  if (agg.length === 0) {
    console.log('No reviewers with reviewed sentences found.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Fetch user details for all reviewer IDs
  const reviewerIds = agg
    .filter((r) => r._id)
    .map((r) => new mongoose.Types.ObjectId(r._id.toString()));

  const users = await User.find({ _id: { $in: reviewerIds } }).lean();
  const userMap = new Map<string, any>();
  for (const u of users as any[]) {
    userMap.set(u._id.toString(), u);
  }

  // Print results
  console.log('\n--- Reviewers by Unique Sentences Reviewed (from review_history) ---\n');
  console.log(
    'Reviewer Email'.padEnd(42) +
    'Reviewed'.padEnd(12) +
    'Accepted'.padEnd(12) +
    'Rejected'
  );
  console.log('-'.repeat(78));

  let grandTotal = 0;
  for (const row of agg) {
    const user = userMap.get(row._id?.toString());
    const email = user?.email || row._id?.toString() || 'unknown';
    console.log(
      email.padEnd(42) +
      String(row.unique_sentences).padEnd(12) +
      String(row.accepted).padEnd(12) +
      String(row.rejected)
    );
    grandTotal += row.unique_sentences;
  }

  console.log('-'.repeat(78));
  console.log(`\nTotal reviewers: ${agg.length}`);
  console.log(`Total unique sentences reviewed: ${grandTotal}`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
