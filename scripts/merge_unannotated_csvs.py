import os
import csv

# Directory containing the CSV files
input_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../dist/imports/unannotated-structured'))
output_file = os.path.join(input_dir, 'merged.csv')

# List all CSV files in the directory
csv_files = [f for f in os.listdir(input_dir) if f.endswith('.csv')]

header_saved = False
with open(output_file, 'w', newline='', encoding='utf-8') as fout:
    writer = None
    for filename in csv_files:
        file_path = os.path.join(input_dir, filename)
        with open(file_path, 'r', encoding='utf-8') as fin:
            reader = csv.reader(fin)
            header = next(reader)
            if not header_saved:
                writer = csv.writer(fout)
                writer.writerow(header)
                header_saved = True
            for row in reader:
                writer.writerow(row)
print(f"Merged {len(csv_files)} files into {output_file}")
