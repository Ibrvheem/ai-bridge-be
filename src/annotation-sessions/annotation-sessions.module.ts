import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnotationSessionsController } from './annotation-sessions.controller';
import { AnnotationSessionsService } from './annotation-sessions.service';
import { AnnotationSession } from './annotation-session.schema';
import { Sentences } from '../sentences/sentences.schema';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'AnnotationSession', schema: AnnotationSession },
      { name: 'Sentences', schema: Sentences },
    ]),
    UploadModule,
  ],
  controllers: [AnnotationSessionsController],
  providers: [AnnotationSessionsService],
  exports: [AnnotationSessionsService],
})
export class AnnotationSessionsModule {}
