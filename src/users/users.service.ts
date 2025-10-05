import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-auth.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel('User') private readonly userModel: Model<User>) { }

  async findUserByID(id: string) {
    const user = await this.userModel
      .findOne({ _id: id })
      .select('-password')
      .select('-otp');
    return user;
  }

  async findUserByEmail(email: string) {
    return await this.userModel.findOne({ email }).exec();
  }


  async createUser(payload: CreateUserDto) {
    const newUser = new this.userModel(payload);
    return newUser.save();
  }

  async updateUser(payload: UpdateUserDto, userId: string) {
    const user = await this.userModel.updateOne(
      {
        _id: userId,
      },
      payload,
    );
    return user;
  }

  async getUsers() {
    return await this.userModel.find();
  }



  async getMe(id: string) {
    const user = await this.userModel.findOne({ _id: id }).select('-password'); // Excluding password
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return user;
  }
}
