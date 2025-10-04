import { IsBoolean, IsString } from 'class-validator';

export class CreateLanguageDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsString()
  native_name: string;

  @IsBoolean()
  isActive: boolean;
}
