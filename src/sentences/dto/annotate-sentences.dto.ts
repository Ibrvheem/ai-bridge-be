import { IsEnum } from 'class-validator';

export enum BiasCategory {
    GENDER = 'GENDER',
    RACE_ETHNICITY = 'RACE_ETHNICITY',
    AGE = 'AGE',
    DISABILITY = 'DISABILITY',
    RELIGION = 'RELIGION',
    NATIONALITY = 'NATIONALITY',
    SOCIOECONOMIC = 'SOCIOECONOMIC',
    NONE = 'NONE'
}

export class AnnotateSentenceDto {
    @IsEnum(BiasCategory)
    bias_category: BiasCategory;
}