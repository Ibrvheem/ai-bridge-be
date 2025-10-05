import { Module } from '@nestjs/common';
import { LanguageService } from './language.service';
import { LanguageController } from './language.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { LanguageSchema } from './language.schema';

@Module({
  controllers: [LanguageController],
  providers: [MongooseModule, LanguageService],
  imports: [MongooseModule.forFeature([{ name: 'Language', schema: LanguageSchema }])],
  exports: [LanguageService],
})
export class LanguageModule { }
