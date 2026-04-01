import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsQueryDto } from './dtos';

@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Get()
  @UseGuards()
  findAll(@Query() auctionsQueryDto: AuctionsQueryDto) {
    return this.auctionsService.findAll(auctionsQueryDto);
  }

  // @Get(':id')
  // @UseGuards(AuthGuard)
  // findOneById(@Param('id') id: string) {
  //   return this.itemsService.findOneById(id, { seller: true, auctions: true });
  // }

  // @Post()
  // @UseGuards(AuthGuard)
  // create(
  //   @Body() createItemDto: CreateItemDto,
  //   @CurrentUser('userId') requestUserId: string,
  // ) {
  //   return this.itemsService.create({
  //     ...createItemDto,
  //     sellerId: requestUserId,
  //   });
  // }

  // @Patch(':id')
  // @UseGuards(AuthGuard)
  // update(
  //   @Param('id') id: string,
  //   @Body() updateItemDto: UpdateItemDto,
  //   @CurrentUser('userId') requestUserId: string,
  // ) {
  //   return this.itemsService.update(id, requestUserId, updateItemDto);
  // }
}
