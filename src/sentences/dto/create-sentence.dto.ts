import { IsString, IsOptional } from 'class-validator';

export class CreateSentenceDto {
    @IsString()
    sentence: string;

    @IsString()
    @IsOptional()
    original_content?: string;

    @IsString()
    @IsOptional()
    bias_category?: string;

    @IsString()
    @IsOptional()
    language?: string;

    @IsString()
    @IsOptional()
    document_id?: string;
}