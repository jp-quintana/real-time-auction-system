import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/common/guards';
import { CreateBidDto } from './dtos';
import { CurrentUser } from 'src/common/decorators';
import { BidsService } from './bids.service';

@Controller('auctions/:auctionId/bids')
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Post()
  @UseGuards(AuthGuard)
  placeBid(
    @Param('auctionId') id: string,
    @Body() createBidDto: CreateBidDto,
    @CurrentUser('userId') requestUserId: string,
  ) {
    return this.bidsService.placeBid(id, requestUserId, createBidDto);
  }
}
