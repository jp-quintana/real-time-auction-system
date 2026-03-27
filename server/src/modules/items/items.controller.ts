import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ItemsService } from './items.service';
import { AuthGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { CreateItemDto } from './dtos';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post('create')
  @UseGuards(AuthGuard)
  create(
    @CurrentUser('userId') requestUserId: string,
    @Body() body: CreateItemDto,
  ) {
    this.itemsService.create({ ...body, sellerId: requestUserId });
  }
}
