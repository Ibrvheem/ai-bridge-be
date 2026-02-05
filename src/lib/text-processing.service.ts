import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface TextProcessingResult {
  originalText: string;
  cleanedText: string;
  detectedLanguage: string;
  isTargetLanguage: boolean;
  confidence: number;
  piiRemoved: boolean;
  removedPii: string[];
}

export interface BatchProcessingResult {
  processed: TextProcessingResult[];
  filtered: TextProcessingResult[]; // Texts that passed language filter
  rejected: TextProcessingResult[]; // Texts that failed language filter
  stats: {
    total: number;
    passed: number;
    rejected: number;
    avgConfidence: number;
  };
}

export interface HausaTextAnalysis {
  isCompleteSentence: boolean;
  isHausa: boolean;
  confidence: number;
  regionDialect: string; // e.g., "Kano", "Sokoto", "Standard", "Zaria", etc.
  topic: string; // Brief topic description
  domain: string; // One of: culture_and_religion, education, health, livelihoods_and_work, governance_civic, media_and_online, household_and_care
  theme: string; // One of: stereotypes, hate_or_insult, misinformation, public_interest, specialized_advice
  sensitiveCharacteristic: string | null; // age, disability, ethnicity, gender, health_status, income_level, nationality, religion, tribe, other, or null
  safetyFlag: string; // safe, sensitive, reject
  reasoning: string;
}

@Injectable()
export class TextProcessingService {
  private readonly logger = new Logger(TextProcessingService.name);
  private anthropic: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
      this.logger.log(
        'Anthropic client initialized for AI language validation',
      );
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY not set. AI language validation will be disabled.',
      );
    }
  }

  /**
   * Remove PII from text (usernames, emails, phone numbers, etc.)
   */
  removePii(text: string): { cleanedText: string; removedPii: string[] } {
    const removedPii: string[] = [];
    let cleanedText = text;

    // Remove Twitter @mentions
    const mentionRegex = /@[\w]+/g;
    const mentions = cleanedText.match(mentionRegex) || [];
    mentions.forEach((m) => removedPii.push(`mention: ${m}`));
    cleanedText = cleanedText.replace(mentionRegex, '[USER]');

    // Remove URLs (they may contain usernames)
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = cleanedText.match(urlRegex) || [];
    urls.forEach((u) => removedPii.push(`url: ${u}`));
    cleanedText = cleanedText.replace(urlRegex, '[URL]');

    // Remove email addresses
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
    const emails = cleanedText.match(emailRegex) || [];
    emails.forEach((e) => removedPii.push(`email: ${e}`));
    cleanedText = cleanedText.replace(emailRegex, '[EMAIL]');

    // Remove phone numbers (various formats)
    const phoneRegex =
      /(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;
    const phones = cleanedText.match(phoneRegex);
    if (phones) {
      phones.forEach((p) => {
        // Only count as phone if it has enough digits
        if (p && p.replace(/\D/g, '').length >= 7) {
          removedPii.push(`phone: ${p}`);
        }
      });
    }
    cleanedText = cleanedText.replace(phoneRegex, (match) => {
      return match.replace(/\D/g, '').length >= 7 ? '[PHONE]' : match;
    });

    // Clean up multiple spaces and trim
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

    return { cleanedText, removedPii };
  }

  /**
   * Detect language using franc (free, local)
   * Returns ISO 639-3 code (e.g., 'hau' for Hausa)
   */
  async detectLanguageLocal(
    text: string,
  ): Promise<{ language: string; confidence: number }> {
    // Dynamic import for ESM module
    const { franc } = await import('franc');

    // franc returns ISO 639-3 codes
    const detected = franc(text, { minLength: 10 });

    // franc doesn't provide confidence, so we estimate based on text length
    const confidence = text.length > 50 ? 0.7 : text.length > 20 ? 0.5 : 0.3;

    return {
      language: detected === 'und' ? 'unknown' : detected,
      confidence,
    };
  }

  /**
   * Validate language using Claude Haiku (cheapest AI option ~$0.25/1M input tokens)
   * Use this for high-confidence validation when needed
   */
  async validateLanguageWithAI(
    text: string,
    targetLanguage: string = 'Hausa',
  ): Promise<{
    isTargetLanguage: boolean;
    confidence: number;
    detectedLanguage: string;
  }> {
    if (!this.anthropic) {
      this.logger.warn('AI validation skipped - no API key configured');
      return {
        isTargetLanguage: false,
        confidence: 0,
        detectedLanguage: 'unknown',
      };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307', // Cheapest model
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `Analyze this text and determine if it's written in ${targetLanguage}. Respond with ONLY a JSON object (no markdown):
{"is_target": true/false, "confidence": 0.0-1.0, "detected_language": "language name"}

Text: "${text.substring(0, 500)}"`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          const result = JSON.parse(content.text);
          return {
            isTargetLanguage: result.is_target === true,
            confidence: result.confidence || 0.5,
            detectedLanguage: result.detected_language || 'unknown',
          };
        } catch {
          this.logger.warn('Failed to parse AI response:', content.text);
        }
      }
    } catch (error) {
      this.logger.error('AI language validation failed:', error.message);
    }

    return {
      isTargetLanguage: false,
      confidence: 0,
      detectedLanguage: 'unknown',
    };
  }

  /**
   * Process a single text: remove PII and validate language
   */
  async processText(
    text: string,
    targetLanguage: string = 'Hausa',
    useAiValidation: boolean = false,
  ): Promise<TextProcessingResult> {
    // Step 1: Remove PII
    const { cleanedText, removedPii } = this.removePii(text);

    // Step 2: Detect language locally first (free)
    const localDetection = await this.detectLanguageLocal(cleanedText);

    // Map ISO 639-3 codes to language names
    const languageMap: Record<string, string> = {
      hau: 'Hausa',
      yor: 'Yoruba',
      ibo: 'Igbo',
      eng: 'English',
      ara: 'Arabic',
      fra: 'French',
      amh: 'Amharic',
      swa: 'Swahili',
    };

    let detectedLanguage =
      languageMap[localDetection.language] || localDetection.language;
    let isTargetLanguage = localDetection.language === 'hau'; // hau = Hausa in ISO 639-3
    let confidence = localDetection.confidence;

    // Step 3: Use AI validation if enabled and local detection is uncertain
    if (useAiValidation && (confidence < 0.6 || !isTargetLanguage)) {
      const aiResult = await this.validateLanguageWithAI(
        cleanedText,
        targetLanguage,
      );
      if (aiResult.confidence > 0) {
        isTargetLanguage = aiResult.isTargetLanguage;
        confidence = aiResult.confidence;
        detectedLanguage = aiResult.detectedLanguage;
      }
    }

    return {
      originalText: text,
      cleanedText,
      detectedLanguage,
      isTargetLanguage,
      confidence,
      piiRemoved: removedPii.length > 0,
      removedPii,
    };
  }

  /**
   * Process multiple texts in batch
   */
  async processBatch(
    texts: string[],
    targetLanguage: string = 'Hausa',
    useAiValidation: boolean = false,
    minConfidence: number = 0.5,
  ): Promise<BatchProcessingResult> {
    const processed: TextProcessingResult[] = [];
    const filtered: TextProcessingResult[] = [];
    const rejected: TextProcessingResult[] = [];

    for (const text of texts) {
      const result = await this.processText(
        text,
        targetLanguage,
        useAiValidation,
      );
      processed.push(result);

      if (result.isTargetLanguage && result.confidence >= minConfidence) {
        filtered.push(result);
      } else {
        rejected.push(result);
      }
    }

    const totalConfidence = filtered.reduce((sum, r) => sum + r.confidence, 0);

    return {
      processed,
      filtered,
      rejected,
      stats: {
        total: texts.length,
        passed: filtered.length,
        rejected: rejected.length,
        avgConfidence:
          filtered.length > 0 ? totalConfidence / filtered.length : 0,
      },
    };
  }

  /**
   * Analyze Hausa text with AI to extract metadata
   * - Checks if it's a complete sentence (not just a phrase)
   * - Detects regional dialect
   * - Identifies topic, domain, theme
   * - Flags sensitive characteristics
   * - Determines safety level
   */
  async analyzeHausaText(text: string): Promise<HausaTextAnalysis | null> {
    if (!this.anthropic) {
      this.logger.warn('AI analysis skipped - no API key configured');
      return null;
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Analyze this text and determine if it's a complete Hausa sentence. Respond with ONLY a valid JSON object (no markdown, no code blocks):

Text: "${text.substring(0, 500)}"

Return this exact JSON structure:
{
  "isCompleteSentence": true/false (is this a complete sentence with subject and predicate, not just a phrase or fragment?),
  "isHausa": true/false (is this primarily Hausa language?),
  "confidence": 0.0-1.0 (how confident are you?),
  "regionDialect": "Standard" or "Kano" or "Sokoto" or "Zaria" or "Katsina" or "Bauchi" or "Unknown" (which Hausa dialect variant?),
  "topic": "brief 2-5 word topic description",
  "domain": one of ["culture_and_religion", "education", "health", "livelihoods_and_work", "governance_civic", "media_and_online", "household_and_care"],
  "theme": one of ["stereotypes", "hate_or_insult", "misinformation", "public_interest", "specialized_advice"],
  "sensitiveCharacteristic": null or one of ["age", "disability", "ethnicity", "gender", "health_status", "income_level", "nationality", "religion", "tribe", "other"],
  "safetyFlag": one of ["safe", "sensitive", "reject"],
  "reasoning": "brief explanation of your analysis"
}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          // Clean up the response - remove any markdown code blocks if present
          let jsonText = content.text.trim();
          if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '');
          }

          const result = JSON.parse(jsonText);
          return {
            isCompleteSentence: result.isCompleteSentence === true,
            isHausa: result.isHausa === true,
            confidence: result.confidence || 0.5,
            regionDialect: result.regionDialect || 'Standard',
            topic: result.topic || '',
            domain: result.domain || 'media_and_online',
            theme: result.theme || 'public_interest',
            sensitiveCharacteristic: result.sensitiveCharacteristic || null,
            safetyFlag: result.safetyFlag || 'safe',
            reasoning: result.reasoning || '',
          };
        } catch (parseError) {
          this.logger.warn(
            'Failed to parse AI analysis response:',
            content.text,
          );
        }
      }
    } catch (error) {
      this.logger.error('AI text analysis failed:', error.message);
    }

    return null;
  }

  /**
   * Analyze multiple texts in batch with rate limiting
   */
  async analyzeHausaTextBatch(
    texts: string[],
    delayMs: number = 200,
  ): Promise<(HausaTextAnalysis | null)[]> {
    const results: (HausaTextAnalysis | null)[] = [];

    for (const text of texts) {
      const analysis = await this.analyzeHausaText(text);
      results.push(analysis);

      // Small delay to avoid rate limiting
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Analyze Yoruba text with AI to extract metadata
   * - Checks if it's a complete sentence (not just a phrase)
   * - Detects regional dialect
   * - Identifies topic, domain, theme
   * - Flags sensitive characteristics
   * - Determines safety level
   */
  async analyzeYorubaText(text: string): Promise<HausaTextAnalysis | null> {
    if (!this.anthropic) {
      this.logger.warn('AI analysis skipped - no API key configured');
      return null;
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Analyze this text and determine if it's a complete Yoruba sentence. Respond with ONLY a valid JSON object (no markdown, no code blocks):

Text: "${text.substring(0, 500)}"

Return this exact JSON structure:
{
  "isCompleteSentence": true/false (is this a complete sentence with subject and predicate, not just a phrase or fragment?),
  "isYoruba": true/false (is this primarily Yoruba language?),
  "confidence": 0.0-1.0 (how confident are you?),
  "regionDialect": "Standard" or "Ekiti" or "Ijebu" or "Oyo" or "Ondo" or "Ijesa" or "Egba" or "Lagos" or "Unknown" (which Yoruba dialect variant?),
  "topic": "brief 2-5 word topic description",
  "domain": one of ["culture_and_religion", "education", "health", "livelihoods_and_work", "governance_civic", "media_and_online", "household_and_care"],
  "theme": one of ["stereotypes", "hate_or_insult", "misinformation", "public_interest", "specialized_advice"],
  "sensitiveCharacteristic": null or one of ["age", "disability", "ethnicity", "gender", "health_status", "income_level", "nationality", "religion", "tribe", "other"],
  "safetyFlag": one of ["safe", "sensitive", "reject"],
  "reasoning": "brief explanation of your analysis"
}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          // Clean up the response - remove any markdown code blocks if present
          let jsonText = content.text.trim();
          if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '');
          }

          const result = JSON.parse(jsonText);
          return {
            isCompleteSentence: result.isCompleteSentence === true,
            isHausa: result.isYoruba === true, // Reuse interface, map isYoruba to isHausa field
            confidence: result.confidence || 0.5,
            regionDialect: result.regionDialect || 'Standard',
            topic: result.topic || '',
            domain: result.domain || 'media_and_online',
            theme: result.theme || 'public_interest',
            sensitiveCharacteristic: result.sensitiveCharacteristic || null,
            safetyFlag: result.safetyFlag || 'safe',
            reasoning: result.reasoning || '',
          };
        } catch (parseError) {
          this.logger.warn(
            'Failed to parse AI Yoruba analysis response:',
            content.text,
          );
        }
      }
    } catch (error) {
      this.logger.error('AI Yoruba text analysis failed:', error.message);
    }

    return null;
  }
}
