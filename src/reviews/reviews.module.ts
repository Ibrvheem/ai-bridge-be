import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewSession } from './review-session.schema';
import { ReviewAssignment } from './review-assignment.schema';
import { Sentences } from '../sentences/sentences.schema';
import { DocumentUpload } from '../sentences/document-upload.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'ReviewSession', schema: ReviewSession },
      { name: 'ReviewAssignment', schema: ReviewAssignment },
      { name: 'Sentences', schema: Sentences },
      { name: 'DocumentUpload', schema: DocumentUpload },
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
