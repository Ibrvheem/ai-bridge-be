import { IsArray, ValidateNested, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSentenceDto } from './create-sentence.dto';

export class BulkCreateSentenceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSentenceDto)
  sentences: CreateSentenceDto[];

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  document_id?: string;
}
