import { Module } from '@nestjs/common';
import { SentencesService } from './sentences.service';
import { SentencesController } from './sentences.controller';

@Module({
  controllers: [SentencesController],
  providers: [SentencesService],
})
export class SentencesModule {}
