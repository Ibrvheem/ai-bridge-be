#!/usr/bin/env python3
"""Split batch_b.csv into 22 randomised chunks."""

import csv
import os
import random

BASE = os.path.dirname(os.path.abspath(__file__))
BATCH_B = os.path.join(BASE, "batch_b.csv")
OUT_DIR = os.path.join(BASE, "batch_b_chunks")
NUM_CHUNKS = 22

os.makedirs(OUT_DIR, exist_ok=True)

# Read all rows
with open(BATCH_B, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    headers = reader.fieldnames
    rows = list(reader)

print(f"Total rows: {len(rows)}")

# Shuffle
random.seed(42)
random.shuffle(rows)

# Split into 22 chunks
base_size = len(rows) // NUM_CHUNKS
remainder = len(rows) % NUM_CHUNKS

offset = 0
for i in range(NUM_CHUNKS):
    chunk_size = base_size + (1 if i < remainder else 0)
    chunk = rows[offset:offset + chunk_size]
    offset += chunk_size

    out_path = os.path.join(OUT_DIR, f"batch_b_part_{i + 1}.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as outf:
        writer = csv.DictWriter(outf, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(chunk)
    print(f"  batch_b_part_{i + 1}.csv: {len(chunk)} sentences")

print(f"\nDone. {NUM_CHUNKS} chunks written to {OUT_DIR}")
