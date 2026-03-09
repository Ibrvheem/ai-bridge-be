import csv
import random
import os

# Path to the merged CSV file
input_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured/merged.csv'))
output_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured/merged_randomized.csv'))

with open(input_file, 'r', encoding='utf-8') as fin:
    reader = list(csv.reader(fin))
    header, rows = reader[0], reader[1:]
    random.shuffle(rows)

with open(output_file, 'w', newline='', encoding='utf-8') as fout:
    writer = csv.writer(fout)
    writer.writerow(header)
    writer.writerows(rows)

print(f"Randomized rows written to {output_file}")