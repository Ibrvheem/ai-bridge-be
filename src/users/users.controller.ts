import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from 'decorators/user.decorator';
import { UpdateUserDto } from './dto/update-auth.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get()
  async getAll() {
    const users = await this.usersService.getUsers();
    console.log('We are here', users);
    return users;
  }
  @Get('/me')
  async getCurrentUser(@User() user) {
    return await this.usersService.getMe(user.userId);
  }
  @Get('/:id')
  async getUser(@Param('id') id: string, @User() user: any) {
    return await this.usersService.findUserByID(id);
  }

  @Patch('/update-profile')
  async updateUserProfile(@User() user, @Body() payload: UpdateUserDto) {
    return await this.usersService.updateUser(payload, user.userId);
  }
}
