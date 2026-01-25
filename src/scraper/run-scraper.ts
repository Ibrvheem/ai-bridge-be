import { BbcHausaScraper } from './bbc-hausa.scraper';
import { splitIntoSentences } from './sentence.util';
import { isHausa } from './hausa-detector';
import { v4 as uuidv4 } from 'uuid';
import { csvWriter } from './csv-writwe.util';

async function run() {
  const scraper = new BbcHausaScraper();
  // Use the correct BBC Hausa homepage
  const sectionUrl = 'https://www.bbc.com/hausa';

  console.log('Fetching article links...');
  const articleLinks = await scraper.getArticleLinks(sectionUrl);

  console.log(`Found ${articleLinks.length} articles`);

  for (const url of articleLinks.slice(0, 10)) {
    console.log(`Scraping: ${url}`);

    const paragraphs = await scraper.extractParagraphs(url);
    const rows = [];

    for (const p of paragraphs) {
      const sentences = splitIntoSentences(p);

      for (const sentence of sentences) {
        if (!isHausa(sentence)) continue;

        rows.push({
          id: uuidv4(),
          language: 'hausa',
          script: 'latin',
          country: 'Nigeria',
          region_dialect: 'standard_hausa',
          source_type: 'media',
          source_ref: url,
          collection_date: new Date().toISOString(),
          text: sentence,
          domain: 'media_and_online',
          topic: 'news_reporting',
          theme: 'public_interest',
          sensitive_characteristic: '',
          safety_flag: 'safe',
          pii_removed: true,
          collector_id: '',
          notes: 'Collected from BBC Hausa',
        });
      }
    }

    if (rows.length) {
      await csvWriter.writeRecords(rows);
      console.log(`Saved ${rows.length} sentences`);
    }
  }

  console.log('Scraping complete');
}

run().catch(console.error);
