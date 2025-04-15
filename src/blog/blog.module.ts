import { Module } from '@nestjs/common';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogSchema } from './blog.schema';

@Module({
  controllers: [BlogController],
  providers: [MongooseModule, BlogService],
  imports: [MongooseModule.forFeature([{ name: 'Blog', schema: BlogSchema }])],
})
export class BlogModule {}
