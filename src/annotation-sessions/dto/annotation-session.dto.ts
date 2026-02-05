import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsMongoId,
} from 'class-validator';
import { SessionStatus } from '../annotation-session.schema';

export class CreateAnnotationSessionDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  language_filter?: string;
}

export class UpdateAnnotationSessionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(SessionStatus)
  @IsOptional()
  status?: SessionStatus;

  @IsString()
  @IsOptional()
  language_filter?: string;
}

export class AddSentenceToSessionDto {
  @IsMongoId()
  sentence_id: string;
}

export class ExportSessionDto {
  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  sentence_ids?: string[]; // If not provided, export all un-exported sentences

  @IsString()
  @IsOptional()
  file_name?: string;
}

export class BulkAddSentencesToSessionDto {
  @IsArray()
  @IsMongoId({ each: true })
  sentence_ids: string[];
}
