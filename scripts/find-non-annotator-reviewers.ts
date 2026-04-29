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
  const Sentence = mongoose.model('Sentence', EmptySchema, 'sentences');
  const User = mongoose.model('User', EmptySchema, 'users');

  // Get all unique reviewer IDs from assignments
  const assignments = await ReviewAssignment.find({}).lean() as any[];
  const reviewerIds = [...new Set(assignments.map((a) => a.reviewer_id?.toString()).filter(Boolean))];
  console.log(`Total unique reviewers assigned: ${reviewerIds.length}`);

  // For each reviewer, check if they have annotated any sentences
  const reviewersWithNoCounts: string[] = [];
  const reviewerAnnotationCounts = new Map<string, number>();

  for (const reviewerId of reviewerIds) {
    const count = await Sentence.countDocuments({
      annotator_id: new mongoose.Types.ObjectId(reviewerId),
      target_gender: { $exists: true, $ne: null },
      bias_label: { $exists: true, $ne: null },
      explicitness: { $exists: true, $ne: null },
    });
    reviewerAnnotationCounts.set(reviewerId, count);
    if (count === 0) {
      reviewersWithNoCounts.push(reviewerId);
    }
  }

  // Get user details
  const allUserIds = reviewerIds.map((id) => new mongoose.Types.ObjectId(id));
  const users = await User.find({ _id: { $in: allUserIds } }).lean() as any[];
  const userMap = new Map<string, any>();
  for (const u of users) {
    userMap.set(u._id.toString(), u);
  }

  // Print all reviewers with their annotation counts
  console.log('\n--- All Reviewers & Their Annotation Counts ---\n');
  console.log(
    'Reviewer Email'.padEnd(40) +
    'Annotated'.padEnd(12) +
    'Status'
  );
  console.log('-'.repeat(75));

  // Sort: non-annotators first
  const sorted = [...reviewerIds].sort((a, b) => {
    return (reviewerAnnotationCounts.get(a) || 0) - (reviewerAnnotationCounts.get(b) || 0);
  });

  for (const rid of sorted) {
    const user = userMap.get(rid);
    const count = reviewerAnnotationCounts.get(rid) || 0;
    const status = count === 0 ? '⚠ HAS NOT ANNOTATED' : '✓ Has annotated';
    console.log(
      (user?.email || rid).padEnd(40) +
      String(count).padEnd(12) +
      status
    );
  }

  // Summary
  console.log(`\n--- Summary ---`);
  console.log(`Total reviewers: ${reviewerIds.length}`);
  console.log(`Reviewers who HAVE annotated: ${reviewerIds.length - reviewersWithNoCounts.length}`);
  console.log(`Reviewers who have NOT annotated: ${reviewersWithNoCounts.length}`);

  if (reviewersWithNoCounts.length > 0) {
    console.log('\n⚠ These reviewers have never annotated a sentence:');
    for (const rid of reviewersWithNoCounts) {
      const user = userMap.get(rid);
      // Find which annotators they're assigned to review
      const theirAssignments = assignments.filter((a) => a.reviewer_id?.toString() === rid);
      const annotatorEmails = theirAssignments.map((a) => {
        const annotator = userMap.get(a.annotator_id?.toString());
        return annotator?.email || a.annotator_id?.toString();
      });
      console.log(`  - ${user?.email || rid} (assigned to review: ${annotatorEmails.join(', ')})`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
