import axios from 'axios';
import * as cheerio from 'cheerio';

export class BbcHausaScraper {
  private baseUrl = 'https://www.bbc.com';

  async fetchHtml(url: string): Promise<string> {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 10000,
    });
    return data;
  }

  async getArticleLinks(sectionUrl: string): Promise<string[]> {
    const html = await this.fetchHtml(sectionUrl);
    const $ = cheerio.load(html);

    const links = new Set<string>();

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      // Match BBC article and live pages for Hausa, exclude topic pages
      const isArticle =
        href.includes('/hausa/articles/') || href.includes('/hausa/live/');
      const isTopic = href.includes('/topics/');

      if (isArticle && !isTopic) {
        const fullUrl = href.startsWith('http') ? href : this.baseUrl + href;
        links.add(fullUrl);
      }
    });

    console.log(`Found ${links.size} unique article links`);
    return Array.from(links);
  }

  async extractParagraphs(articleUrl: string): Promise<string[]> {
    const html = await this.fetchHtml(articleUrl);
    const $ = cheerio.load(html);

    const paragraphs: string[] = [];

    // BBC uses various selectors for article content
    $(
      'article p, main p, [data-component="text-block"] p, .ssrcss-1q0x1qg-Paragraph p',
    ).each((_, el) => {
      const text = $(el).text().trim();
      // Filter out short paragraphs and common non-content text
      if (text.length > 30 && !text.includes('Getty Images')) {
        paragraphs.push(text);
      }
    });

    console.log(`Extracted ${paragraphs.length} paragraphs from ${articleUrl}`);
    return paragraphs;
  }
}
