import { IsEnum, IsOptional, IsNumber, IsString, Min } from 'class-validator';
import {
  TargetGender,
  BiasLabel,
  Explicitness,
  StereotypeCategory,
  SentimentTowardReferent,
  Device,
  QAStatus,
} from '../types/data-collection.types';

export {
  TargetGender,
  BiasLabel,
  Explicitness,
  StereotypeCategory,
  SentimentTowardReferent,
  Device,
  QAStatus,
};

export class AnnotateSentenceDto {
  @IsEnum(TargetGender)
  target_gender: TargetGender;

  @IsEnum(BiasLabel)
  bias_label: BiasLabel;

  @IsEnum(Explicitness)
  explicitness: Explicitness;

  @IsEnum(StereotypeCategory)
  @IsOptional()
  stereotype_category?: StereotypeCategory | null;

  @IsEnum(SentimentTowardReferent)
  @IsOptional()
  sentiment_toward_referent?: SentimentTowardReferent | null;

  @IsEnum(Device)
  @IsOptional()
  device?: Device | null;

  @IsEnum(QAStatus)
  @IsOptional()
  qa_status?: QAStatus = QAStatus.NEEDS_REVIEW;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  annotation_time_seconds?: number;
}