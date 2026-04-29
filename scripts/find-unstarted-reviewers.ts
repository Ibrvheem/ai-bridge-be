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

  const ReviewAssignment = mongoose.model('ReviewAssignment', EmptySchema, 'reviewassignments');
  const ReviewSession = mongoose.model('ReviewSession', EmptySchema, 'reviewsessions');
  const User = mongoose.model('User', EmptySchema, 'users');

  // Get all reviewer assignments
  const assignments = await ReviewAssignment.find({}).lean();
  console.log(`Total reviewer assignments: ${assignments.length}`);

  if (assignments.length === 0) {
    console.log('No reviewer assignments found. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Get all review sessions
  const sessions = await ReviewSession.find({}).lean();

  // Build a set of reviewer IDs that have started at least one session with reviewed sentences
  const startedSet = new Set<string>();
  for (const session of sessions) {
    const s = session as any;
    const reviewedCount = s.reviewed_sentence_ids?.length || 0;
    if (reviewedCount > 0) {
      // This reviewer has started reviewing for this annotator
      startedSet.add(`${s.reviewer_id?.toString()}::${s.annotator_id?.toString()}`);
    }
  }

  // Find assignments where the reviewer has NOT started any review
  const notStarted = (assignments as any[]).filter((a) => {
    const key = `${a.reviewer_id?.toString()}::${a.annotator_id?.toString()}`;
    return !startedSet.has(key);
  });

  console.log(`\nAssignments with NO review progress: ${notStarted.length}`);

  if (notStarted.length === 0) {
    console.log('All assigned reviewers have started their reviews.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Get user details for the reviewers and annotators
  const userIds = new Set<string>();
  for (const a of notStarted) {
    if (a.reviewer_id) userIds.add(a.reviewer_id.toString());
    if (a.annotator_id) userIds.add(a.annotator_id.toString());
  }

  const users = await User.find({
    _id: { $in: Array.from(userIds).map((id) => new mongoose.Types.ObjectId(id)) },
  }).lean();

  const userMap = new Map<string, any>();
  for (const u of users as any[]) {
    userMap.set(u._id.toString(), u);
  }

  // Print results
  console.log('\n--- Reviewers Assigned But Not Started ---\n');
  console.log(
    'Reviewer Email'.padEnd(35) +
    'Annotator Email'.padEnd(35) +
    'Assigned At'
  );
  console.log('-'.repeat(90));

  for (const a of notStarted as any[]) {
    const reviewer = userMap.get(a.reviewer_id?.toString());
    const annotator = userMap.get(a.annotator_id?.toString());
    const assignedAt = a.created_at
      ? new Date(a.created_at).toISOString().split('T')[0]
      : 'N/A';

    console.log(
      (reviewer?.email || a.reviewer_id?.toString() || 'unknown').padEnd(35) +
      (annotator?.email || a.annotator_id?.toString() || 'unknown').padEnd(35) +
      assignedAt
    );
  }

  console.log(`\nTotal: ${notStarted.length} assignment(s) with no review progress.`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
