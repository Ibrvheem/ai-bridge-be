import { IsString, IsOptional } from 'class-validator';

export class CreateSentenceDto {
    @IsString()
    sentence: string;

    @IsString()
    language: string

    @IsString()
    @IsOptional()
    original_content?: string;

    @IsString()
    bias_category: string;

    @IsString()
    @IsOptional()
    document_id?: string;


}