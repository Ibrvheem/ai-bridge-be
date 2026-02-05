import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import {
  Script,
  SourceType,
  Domain,
  Theme,
  SensitiveCharacteristic,
  SafetyFlag,
} from '../../sentences/types/data-collection.types';

export enum TweetSearchType {
  RECENT = 'recent',
  ALL = 'all', // Requires Academic Research access
}

export class SearchTweetsDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(100)
  maxResults?: number = 100;

  @IsOptional()
  @IsString()
  nextToken?: string;

  @IsOptional()
  @IsEnum(TweetSearchType)
  searchType?: TweetSearchType = TweetSearchType.RECENT;

  @IsOptional()
  @IsString()
  startTime?: string; // ISO 8601 format

  @IsOptional()
  @IsString()
  endTime?: string; // ISO 8601 format

  @IsOptional()
  @IsString()
  language?: string; // e.g., 'ha' for Hausa

  @IsOptional()
  @IsNumber()
  @Min(1)
  minCharCount?: number;

  @IsOptional()
  @IsNumber()
  maxCharCount?: number;

  // Text processing options
  @IsBoolean()
  @IsOptional()
  removePii?: boolean = false; // Remove usernames, emails, URLs from text

  @IsBoolean()
  @IsOptional()
  filterByLanguage?: boolean = false; // Filter out non-target language texts

  @IsBoolean()
  @IsOptional()
  useAiValidation?: boolean = false; // Use Claude Haiku for language validation (costs ~$0.25/1M tokens)

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  minLanguageConfidence?: number = 0.5; // Minimum confidence threshold

  @IsString()
  @IsOptional()
  targetLanguage?: string = 'hausa'; // Target language for validation

  // Auto-save to CSV
  @IsBoolean()
  @IsOptional()
  saveToFile?: boolean = false; // Save results to CSV file on server

  @IsString()
  @IsOptional()
  outputDir?: string; // Custom output directory (defaults to ./exports)
}

export class GetUserTweetsDto {
  @IsString()
  username: string;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(100)
  maxResults?: number = 100;

  @IsOptional()
  @IsString()
  nextToken?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;
}

export class GetTweetsByHashtagDto {
  @IsString()
  hashtag: string;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(100)
  maxResults?: number = 100;

  @IsOptional()
  @IsString()
  nextToken?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class StreamRulesDto {
  @IsArray()
  @IsString({ each: true })
  rules: string[];

  @IsOptional()
  @IsString()
  tag?: string;
}

export interface TweetData {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  author_username?: string;
  author_name?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
  lang?: string;
  source?: string;
  conversation_id?: string;
}

export interface TwitterApiResponse {
  data: TweetData[];
  meta?: {
    result_count: number;
    next_token?: string;
    newest_id?: string;
    oldest_id?: string;
  };
  includes?: {
    users?: Array<{
      id: string;
      name: string;
      username: string;
    }>;
  };
}

export interface ScrapedTweetsResult {
  success: boolean;
  tweets: TweetData[];
  totalCount: number;
  nextToken?: string;
  language?: string;
  query?: string;
  // Processing stats (when PII removal or language filtering is enabled)
  processingStats?: {
    originalCount: number;
    afterLanguageFilter: number;
    piiRemoved: boolean;
    languageFiltered: boolean;
    rejectedCount: number;
  };
  // File info (when saveToFile is enabled)
  savedFile?: {
    path: string;
    filename: string;
    rowCount: number;
  };
}

export class ExportTweetsToCsvDto extends SearchTweetsDto {
  @IsString()
  @IsOptional()
  defaultLanguage?: string = 'hausa';

  @IsEnum(Script)
  @IsOptional()
  defaultScript?: Script = Script.LATIN;

  @IsString()
  @IsOptional()
  defaultCountry?: string = 'Nigeria';

  @IsString()
  @IsOptional()
  defaultRegionDialect?: string;

  @IsEnum(Domain)
  @IsOptional()
  defaultDomain?: Domain = Domain.MEDIA_AND_ONLINE;

  @IsString()
  @IsOptional()
  defaultTopic?: string;

  @IsEnum(Theme)
  @IsOptional()
  defaultTheme?: Theme = Theme.PUBLIC_INTEREST;

  @IsEnum(SensitiveCharacteristic)
  @IsOptional()
  defaultSensitiveCharacteristic?: SensitiveCharacteristic;

  @IsEnum(SafetyFlag)
  @IsOptional()
  defaultSafetyFlag?: SafetyFlag = SafetyFlag.SAFE;

  @IsBoolean()
  @IsOptional()
  defaultPiiRemoved?: boolean = false;

  @IsString()
  @IsOptional()
  filename?: string;

  @IsBoolean()
  @IsOptional()
  filterByLanguage?: boolean = true; // Filter out non-target language texts

  @IsBoolean()
  @IsOptional()
  useAiValidation?: boolean = false; // Use AI for language validation (costs money)

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  minLanguageConfidence?: number = 0.5; // Minimum confidence for language detection

  @IsBoolean()
  @IsOptional()
  removePii?: boolean = true; // Remove usernames, emails, etc.
}
