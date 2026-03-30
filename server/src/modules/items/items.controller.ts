import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ItemsService } from './items.service';
import { AdminGuard, AuthGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { CreateItemDto } from './dtos';
import { ItemsQueryDto } from './dtos/items-query.dto';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}
  @Get()
  @UseGuards(AuthGuard, AdminGuard)
  findAll(@Query() itemsQueryDto: ItemsQueryDto) {
    return this.itemsService.findAll(
      itemsQueryDto.page,
      itemsQueryDto.pageSize,
    );
  }

  @Post()
  @UseGuards(AuthGuard)
  create(
    @Body() body: CreateItemDto,
    @CurrentUser('userId') requestUserId: string,
  ) {
    return this.itemsService.create({ ...body, sellerId: requestUserId });
  }
}
