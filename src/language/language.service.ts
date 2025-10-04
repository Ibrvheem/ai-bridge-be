import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateLanguageDto } from './dto/create-language.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Language } from './language.schema';
import { Model } from 'mongoose';

@Injectable()
export class LanguageService {
  constructor(@InjectModel('Language') private readonly languageModel: Model<Language>) { }

  async create(createLanguageDto: CreateLanguageDto) {
    try {
      const response = await this.languageModel.create(createLanguageDto);
      return response;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }
  async getMany() {
    try {
      const response = await this.languageModel.find({});

      return response;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }
  async remove(id: string) {
    try {
      const response = await this.languageModel.findByIdAndDelete(id);
      return response;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }
}
