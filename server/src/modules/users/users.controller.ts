import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from 'src/common/guards';
import { Request } from 'express';
import { CurrentUser } from 'src/common/decorators';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  getProfile(@CurrentUser('userId') userId: string) {
    return this.usersService.findOneById(userId);
  }
}
