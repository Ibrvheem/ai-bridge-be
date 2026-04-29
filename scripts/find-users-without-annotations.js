// mongosh script: Find users who have not done any annotation
// Run in MongoDB Compass Shell or via: mongosh <connection-string> --file scripts/find-users-without-annotations.js

// Get all distinct annotator_ids from sentences
const annotatorIds = db.sentences.distinct("annotator_id", {
  annotator_id: { $ne: null },
});

print(`\nTotal users who have annotated: ${annotatorIds.length}`);

// Find users whose _id is NOT in the annotator list
const usersWithoutAnnotations = db.users
  .find(
    { _id: { $nin: annotatorIds } },
    { email: 1, type: 1, created_at: 1 }
  )
  .sort({ created_at: -1 })
  .toArray();

// Check which non-annotators have actually QA'd at least one sentence
// by looking at review_history entries (accepted/rejected actions)
const nonAnnotatorIds = usersWithoutAnnotations.map((u) => u._id);

const usersWhoQAd = db.sentences.distinct("review_history.user_id", {
  "review_history": {
    $elemMatch: {
      user_id: { $in: nonAnnotatorIds },
      action: { $in: ["accepted", "rejected"] },
    },
  },
});

const qaUserIdSet = new Set(usersWhoQAd.map((id) => id.toString()));

print(`Total users who have NOT annotated: ${usersWithoutAnnotations.length}`);
print(`Of those, have QA'd at least 1 sentence: ${qaUserIdSet.size}`);
print(`Neither annotating nor QA'ing: ${usersWithoutAnnotations.length - qaUserIdSet.size}\n`);

print("─".repeat(95));
print(
  "Email".padEnd(40) +
    "Type".padEnd(15) +
    "Doing QA?".padEnd(12) +
    "Created At"
);
print("─".repeat(95));

usersWithoutAnnotations.forEach((user) => {
  const email = (user.email || "N/A").padEnd(40);
  const type = (user.type || "N/A").padEnd(15);
  const doingQA = qaUserIdSet.has(user._id.toString()) ? "Yes" : "No";
  const createdAt = user.created_at
    ? new Date(user.created_at).toISOString().split("T")[0]
    : "N/A";
  print(`${email}${type}${doingQA.padEnd(12)}${createdAt}`);
});

print("─".repeat(95));
