import csv
import os

# Path to batch_a.csv
input_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured/batch_a.csv'))
output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured/batch_a_chunks'))

CHUNK_SIZE = 500

os.makedirs(output_dir, exist_ok=True)

with open(input_file, 'r', encoding='utf-8') as fin:
    reader = list(csv.reader(fin))
    header, rows = reader[0], reader[1:]

num_chunks = (len(rows) + CHUNK_SIZE - 1) // CHUNK_SIZE
for i in range(num_chunks):
    chunk_rows = rows[i * CHUNK_SIZE:(i + 1) * CHUNK_SIZE]
    chunk_file = os.path.join(output_dir, f'batch_a_part_{i+1}.csv')
    with open(chunk_file, 'w', newline='', encoding='utf-8') as fout:
        writer = csv.writer(fout)
        writer.writerow(header)
        writer.writerows(chunk_rows)
    print(f"Wrote {len(chunk_rows)} rows to {chunk_file}")