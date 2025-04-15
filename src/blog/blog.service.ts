import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Blog } from './blog.schema';
import { Model } from 'mongoose';

@Injectable()
export class BlogService {
  constructor(@InjectModel('Blog') private readonly blogModel: Model<Blog>) {}

  async create(createBlogDto: CreateBlogDto) {
    try {
      const response = await this.blogModel.create(createBlogDto);
      return response;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }
  async getMany() {
    try {
      const response = await this.blogModel.find({});
      return response;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }
}
