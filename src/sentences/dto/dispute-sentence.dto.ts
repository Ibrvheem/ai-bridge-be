import { IsString, MinLength } from 'class-validator';

export class DisputeSentenceDto {
  @IsString()
  @MinLength(1, { message: 'dispute_notes is required when disputing' })
  dispute_notes: string;
}
