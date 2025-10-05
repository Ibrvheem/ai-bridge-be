import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SUCCESS } from 'constants/CustomResponses';
import { sendOTPDTO, verifyOTPDTO } from './dto/send-otp.dto';
import { UpdateUserDto } from 'src/users/dto/update-auth.dto';
import { User } from 'src/users/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

  async register(payload: UpdateUserDto) {
    const user = await this.userService.findUserByEmail(payload.email);
    if (user) {
      throw new BadRequestException('User already exists');
    }

    try {
      const hashedPassword = await bcrypt.hash(payload.password, 10);
      await this.userService.createUser(
        {
          email: payload.email,
          password: hashedPassword,
        },
      );
      return SUCCESS;
    } catch (err) {
      throw new NotFoundException(err);
    }
  }
  async validateUser(email: string, password: string) {
    const user = await this.userService.findUserByEmail(email.toLowerCase());

    if (!user) {
      throw new NotFoundException('User not found');
    }
    const isPassword = await bcrypt.compare(password, user.password);

    if (!isPassword) {
      throw new UnauthorizedException('Invalid Credentials');
    }
    console.log(user)
    return user;
  }
  async login(user: User) {
    const payload = { email: user.email, userId: user.id };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        email: user.email,
        id: user.id,
        type: user.type
      },
    };
  }
  async sendOTP(payload: sendOTPDTO) {
    const otp = Math.floor(100000 + Math.random() * 900000);

    const user = await this.userService.findUserByEmail(payload.email);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    try {
      // const updateUser = await this.userService.updateUser(
      //   {
      //     otp: otp.toString(),
      //   },
      //   user.id,
      // );
      return { status: 200, otp };
    } catch (err) {
      throw new BadRequestException(err);
    }
  }

  async verifyOTP(payload: verifyOTPDTO) {
    try {
      const user = await this.userService.findUserByEmail(payload.email);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // if (user.otp === payload.otp) {
      //   await this.userService.updateUser(
      //     {
      //       status: 'otp_verified',
      //     },
      //     user.id,
      //   );
      //   return SUCCESS;
      // } else {
      //   throw new BadRequestException('Unable to verify OTP');
      // }
    } catch (err) {
      throw new InternalServerErrorException();
    }
  }
}
