import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminGuard, AuthGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { ItemsService } from '../items/items.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE_NAME, ERROR_MESSAGES } from 'src/common/constants';

@ApiTags('users')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly itemsService: ItemsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all users returned successfully',
  })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile returned successfully',
  })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.USER_NOT_FOUND })
  getProfile(@CurrentUser('userId') requestUserId: string) {
    return this.usersService.findOneById(requestUserId);
  }

  @Get('me/items')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get items belonging to the current user' })
  @ApiResponse({ status: 200, description: 'User items returned successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  getUserItems(@CurrentUser('userId') requestUserId: string) {
    return this.itemsService.findAll(
      { sellerId: requestUserId },
      { seller: false, auctions: true },
    );
  }
}
