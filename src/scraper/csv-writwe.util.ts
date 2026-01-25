import { createObjectCsvWriter } from 'csv-writer';
import * as path from 'path';
import * as fs from 'fs';

const csvPath = path.join(process.cwd(), 'hausa_data.csv');
const fileExists = fs.existsSync(csvPath);

export const csvWriter = createObjectCsvWriter({
  path: csvPath,
  append: true,
  header: [
    { id: 'id', title: 'id' },
    { id: 'language', title: 'language' },
    { id: 'script', title: 'script' },
    { id: 'country', title: 'country' },
    { id: 'region_dialect', title: 'region_dialect' },
    { id: 'source_type', title: 'source_type' },
    { id: 'source_ref', title: 'source_ref' },
    { id: 'collection_date', title: 'collection_date' },
    { id: 'text', title: 'text' },
    { id: 'domain', title: 'domain' },
    { id: 'topic', title: 'topic' },
    { id: 'theme', title: 'theme' },
    { id: 'sensitive_characteristic', title: 'sensitive_characteristic' },
    { id: 'safety_flag', title: 'safety_flag' },
    { id: 'pii_removed', title: 'pii_removed' },
    { id: 'collector_id', title: 'collector_id' },
    { id: 'notes', title: 'notes' },
  ],
  alwaysQuote: true,
});

// Write headers if file doesn't exist or is empty
if (!fileExists || fs.statSync(csvPath).size === 0) {
  const headers =
    'id,language,script,country,region_dialect,source_type,source_ref,collection_date,text,domain,topic,theme,sensitive_characteristic,safety_flag,pii_removed,collector_id,notes\n';
  fs.writeFileSync(csvPath, headers);
}
