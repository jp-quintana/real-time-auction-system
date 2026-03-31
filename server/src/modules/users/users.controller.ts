import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { ItemsService } from '../items/items.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly itemsService: ItemsService,
  ) {}
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getProfile(@CurrentUser('userId') requestUserId: string) {
    return this.usersService.findOneById(requestUserId);
  }

  @Get('me/items')
  @UseGuards(AuthGuard)
  getUserItems(@CurrentUser('userId') requestUserId: string) {
    return this.itemsService.findAll({ sellerId: requestUserId }, false);
  }
}
