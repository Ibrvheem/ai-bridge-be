#!/usr/bin/env python3
"""Merge all CSV files in this directory into one unified CSV."""

import csv
import glob
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "merged_all.csv")


def main():
    csv_files = sorted(glob.glob(os.path.join(SCRIPT_DIR, "*.csv")))
    # Exclude output file and this script from input
    csv_files = [f for f in csv_files if os.path.basename(f) != "merged_all.csv"]

    if not csv_files:
        print("No CSV files found.")
        return

    # First pass: collect all unique headers in order of appearance
    all_headers = []
    seen = set()
    for filepath in csv_files:
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            if headers:
                for h in headers:
                    h = h.strip()
                    if h and h not in seen:
                        all_headers.append(h)
                        seen.add(h)

    print(f"Unified headers ({len(all_headers)} columns): {all_headers}")

    # Second pass: merge all rows
    total_rows = 0
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as out_f:
        writer = csv.DictWriter(out_f, fieldnames=all_headers, extrasaction="ignore")
        writer.writeheader()

        for filepath in csv_files:
            basename = os.path.basename(filepath)
            file_rows = 0
            with open(filepath, "r", encoding="utf-8") as in_f:
                reader = csv.DictReader(in_f)
                for row in reader:
                    # Strip whitespace from keys
                    cleaned = {k.strip(): v for k, v in row.items() if k}
                    writer.writerow(cleaned)
                    file_rows += 1
            print(f"  {basename}: {file_rows} rows")
            total_rows += file_rows

    print(
        f"\nMerged {total_rows} total rows from {len(csv_files)} files into {os.path.basename(OUTPUT_FILE)}"
    )


if __name__ == "__main__":
    main()
