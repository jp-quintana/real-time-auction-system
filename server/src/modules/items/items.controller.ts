import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { RolesGuard, AuthGuard } from 'src/common/guards';
import { CurrentUser, Roles } from 'src/common/decorators';
import { CreateItemDto, ItemsQueryDto, UpdateItemDto } from './dtos';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE_NAME, ERROR_MESSAGES } from 'src/common/constants';

@ApiTags('items')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME)
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  @Roles('admin')
  @UseGuards(AuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get all items (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all items returned successfully',
  })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(@Query() itemsQueryDto: ItemsQueryDto) {
    return this.itemsService.findAll(itemsQueryDto);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiResponse({ status: 200, description: 'Item returned successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.ITEM_NOT_FOUND })
  findOneById(@Param('id') id: string) {
    return this.itemsService.findOneById(id, { seller: true, auctions: true });
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a new item' })
  @ApiResponse({ status: 201, description: 'Item created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  create(
    @Body() createItemDto: CreateItemDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.itemsService.create(userId, createItemDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update an item' })
  @ApiResponse({ status: 200, description: 'Item updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.ITEM_NOT_FOUND })
  update(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.itemsService.update(id, userId, updateItemDto);
  }
}
