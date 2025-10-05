import { IsArray, ValidateNested, IsString, IsOptional, isString } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSentenceDto } from './create-sentence.dto';

export class BulkCreateSentenceDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateSentenceDto)
    sentences: CreateSentenceDto[];

    @IsString()
    @IsOptional()
    document_id?: string;

    @IsString()
    language: string
}

export class UploadCsvDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateSentenceDto)
    sentences: CreateSentenceDto[];

    filePath?: string;

    @IsString()
    @IsOptional()
    document_id?: string;
}