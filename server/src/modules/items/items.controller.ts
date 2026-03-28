import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ItemsService } from './items.service';
import { AuthGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { CreateItemDto } from './dtos';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}
  @Get()
  findAll() {
    return this.itemsService.findAll();
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
