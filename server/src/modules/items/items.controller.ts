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
import { AdminGuard, AuthGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { CreateItemDto, ItemsQueryDto, UpdateItemDto } from './dtos';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}
  @Get()
  @UseGuards(AuthGuard, AdminGuard)
  findAll(@Query() itemsQueryDto: ItemsQueryDto) {
    return this.itemsService.findAll(itemsQueryDto);
  }

  @Post()
  @UseGuards(AuthGuard)
  create(
    @Body() createItemDto: CreateItemDto,
    @CurrentUser('userId') requestUserId: string,
  ) {
    return this.itemsService.create({
      ...createItemDto,
      sellerId: requestUserId,
    });
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto,
    @CurrentUser('userId') requestUserId: string,
  ) {
    return this.itemsService.update(id, requestUserId, updateItemDto);
  }
}
