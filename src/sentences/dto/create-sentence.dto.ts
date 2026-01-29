import { IsString, IsOptional, IsEnum, IsBoolean, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import {
  Script,
  SourceType,
  Domain,
  Theme,
  SensitiveCharacteristic,
  SafetyFlag,
} from '../types/data-collection.types';

export class CreateSentenceDto {
  @IsString()
  text: string;

  @IsString()
  language: string;

  @IsEnum(Script)
  @IsOptional()
  script?: Script = Script.LATIN;

  @IsString()
  country: string;

  @IsString()
  @IsOptional()
  region_dialect?: string;

  @IsEnum(SourceType)
  source_type: SourceType;

  @IsString()
  @IsOptional()
  source_ref?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  collection_date?: Date;

  @IsEnum(Domain)
  domain: Domain;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsEnum(Theme)
  theme: Theme;

  @IsEnum(SensitiveCharacteristic)
  @IsOptional()
  sensitive_characteristic?: SensitiveCharacteristic | null;

  @IsEnum(SafetyFlag)
  @IsOptional()
  safety_flag?: SafetyFlag = SafetyFlag.SAFE;

  @IsBoolean()
  @IsOptional()
  pii_removed?: boolean = false;

  @IsString()
  @IsOptional()
  notes?: string | null;
}