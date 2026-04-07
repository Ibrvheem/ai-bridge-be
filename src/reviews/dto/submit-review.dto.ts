import { IsEnum, IsOptional, IsString } from 'class-validator';
import { QAStatus } from '../../sentences/types/data-collection.types';

export class SubmitReviewDto {
  @IsEnum(QAStatus, {
    message: 'qa_status must be one of: accepted, rejected',
  })
  qa_status: QAStatus;

  @IsString()
  @IsOptional()
  review_notes?: string;
}
