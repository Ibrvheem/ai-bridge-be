import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { User } from 'decorators/user.decorator';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ==================== ADMIN: ASSIGN REVIEWER ====================

  @Post('assign')
  assignReviewer(@Body() body: { reviewer_id: string; annotator_id: string }) {
    return this.reviewsService.assignReviewer(
      body.reviewer_id,
      body.annotator_id,
    );
  }

  @Get('assignments')
  getAllAssignments(): Promise<any[]> {
    return this.reviewsService.getAllAssignments();
  }

  @Delete('assign/:reviewerId/:annotatorId')
  removeAssignment(
    @Param('reviewerId') reviewerId: string,
    @Param('annotatorId') annotatorId: string,
  ) {
    return this.reviewsService.removeAssignment(reviewerId, annotatorId);
  }

  // ==================== REVIEWER: ASSIGNMENTS & SESSIONS ====================

  @Get('my-assignments')
  getMyAssignments(@User() user): Promise<any[]> {
    return this.reviewsService.getMyAssignments(user.userId);
  }

  @Get('annotator/:annotatorId/sessions')
  getAnnotatorSessions(
    @User() user,
    @Param('annotatorId') annotatorId: string,
  ) {
    return this.reviewsService.getAnnotatorSessions(user.userId, annotatorId);
  }

  @Post('start')
  startSessionReview(
    @User() user,
    @Body() body: { document_id: string; annotator_id: string },
  ) {
    return this.reviewsService.startSessionReview(
      user.userId,
      body.document_id,
      body.annotator_id,
    );
  }

  // ==================== REVIEW SESSIONS ====================

  @Get()
  getReviewSessions(@User() user): Promise<any[]> {
    return this.reviewsService.getReviewSessions(user.userId);
  }

  @Get(':id')
  getReviewSession(@Param('id') id: string): Promise<any> {
    return this.reviewsService.getReviewSession(id);
  }

  @Get(':id/stats')
  getReviewSessionStats(@Param('id') id: string) {
    return this.reviewsService.getReviewSessionStats(id);
  }

  @Get(':id/sentences')
  getReviewSentences(
    @Param('id') id: string,
    @Query('filter') filter?: string,
  ) {
    return this.reviewsService.getReviewSentences(id, filter);
  }

  @Patch(':id/sentences/:sentenceId')
  submitReview(
    @Param('id') id: string,
    @Param('sentenceId') sentenceId: string,
    @Body() submitReviewDto: SubmitReviewDto,
    @User() user,
  ) {
    return this.reviewsService.submitReview(
      id,
      sentenceId,
      user.userId,
      submitReviewDto,
    );
  }
}
