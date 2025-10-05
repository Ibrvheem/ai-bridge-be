import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { Public } from 'decorators/public.decorator';
import { sendOTPDTO, verifyOTPDTO } from './dto/send-otp.dto';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('/signup')
  create(@Body() payload: CreateUserDto) {
    return this.authService.register(payload);
  }
  @UseGuards(AuthGuard('local'))
  @Post('/signin')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post('/send-otp')
  sendOTP(@Body() payload: sendOTPDTO) {
    return this.authService.sendOTP(payload);
  }
  @Post('/verify-otp')
  verifyOTP(@Body() payload: verifyOTPDTO) {
    return this.authService.verifyOTP(payload);
  }
}
