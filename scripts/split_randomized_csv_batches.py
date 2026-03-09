import csv
import os

# Path to the randomized CSV file
input_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured/merged_randomized.csv'))
batch_a_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured/batch_a.csv'))
batch_b_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured/batch_b.csv'))

BATCH_A_SIZE = 10000

with open(input_file, 'r', encoding='utf-8') as fin:
    reader = list(csv.reader(fin))
    header, rows = reader[0], reader[1:]
    batch_a_rows = rows[:BATCH_A_SIZE]
    batch_b_rows = rows[BATCH_A_SIZE:]

with open(batch_a_file, 'w', newline='', encoding='utf-8') as fout_a:
    writer_a = csv.writer(fout_a)
    writer_a.writerow(header)
    writer_a.writerows(batch_a_rows)

with open(batch_b_file, 'w', newline='', encoding='utf-8') as fout_b:
    writer_b = csv.writer(fout_b)
    writer_b.writerow(header)
    writer_b.writerows(batch_b_rows)

print(f"Batch A (first 10,000) written to {batch_a_file}")
print(f"Batch B (rest) written to {batch_b_file}")