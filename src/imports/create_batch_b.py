#!/usr/bin/env python3
"""Create batch_b.csv: sentences from merged_all that are NOT in merged_batch_a."""

import csv
import os

BASE = os.path.dirname(os.path.abspath(__file__))
MERGED_ALL = os.path.join(BASE, "unannotated-structured", "merged_all.csv")
BATCH_A = os.path.join(BASE, "batch_a_chunks", "merged_batch_a.csv")
BATCH_B = os.path.join(BASE, "batch_b.csv")

# Load texts from batch_a
batch_a_texts = set()
with open(BATCH_A, "r", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        batch_a_texts.add(row.get("text", "").strip())

print(f"batch_a: {len(batch_a_texts)} unique texts")

# Filter merged_all to only rows NOT in batch_a
count = 0
with open(MERGED_ALL, "r", encoding="utf-8") as inf, \
     open(BATCH_B, "w", newline="", encoding="utf-8") as outf:
    reader = csv.DictReader(inf)
    writer = csv.DictWriter(outf, fieldnames=reader.fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in reader:
        if row.get("text", "").strip() not in batch_a_texts:
            writer.writerow(row)
            count += 1

print(f"batch_b.csv created with {count} sentences")
