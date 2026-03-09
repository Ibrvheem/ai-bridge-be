import csv
import os

# Paths

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured'))
batch_b_file = os.path.join(base_dir, 'batch_b.csv')
chunks_dir = os.path.join(base_dir, 'batch_a_chunks')
chunk_21_file = os.path.join(chunks_dir, 'batch_a_part_21.csv')
chunk_22_file = os.path.join(chunks_dir, 'batch_a_part_22.csv')

EXTRACT_SIZE = 1000
CHUNK_SIZE = 500

# Read batch_b
with open(batch_b_file, 'r', encoding='utf-8') as fin:
    reader = list(csv.reader(fin))
    header, rows = reader[0], reader[1:]

extract_rows = rows[:EXTRACT_SIZE]
remaining_rows = rows[EXTRACT_SIZE:]


# Split into two chunks
chunk_21_rows = extract_rows[:CHUNK_SIZE]
chunk_22_rows = extract_rows[CHUNK_SIZE:EXTRACT_SIZE]

# Write new chunk files
with open(chunk_21_file, 'w', newline='', encoding='utf-8') as fout21:
    writer21 = csv.writer(fout21)
    writer21.writerow(header)
    writer21.writerows(chunk_21_rows)

with open(chunk_22_file, 'w', newline='', encoding='utf-8') as fout22:
    writer22 = csv.writer(fout22)
    writer22.writerow(header)
    writer22.writerows(chunk_22_rows)

# Overwrite batch_b with remaining rows
with open(batch_b_file, 'w', newline='', encoding='utf-8') as foutb:
    writerb = csv.writer(foutb)
    writerb.writerow(header)
    writerb.writerows(remaining_rows)

print(f"Extracted 1000 rows from batch_b and saved as batch_a_part_21.csv and batch_a_part_22.csv. Updated batch_b.csv.")