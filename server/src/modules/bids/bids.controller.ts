import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/common/guards';
import { CreateBidDto } from './dtos';
import { CurrentUser } from 'src/common/decorators';
import { BidsService } from './bids.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ERROR_MESSAGES } from 'src/common/constants';
import { ACCESS_TOKEN_COOKIE_NAME } from '../auth/constants';

@ApiTags('bids')
@Controller('auctions/:auctionId/bids')
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME)
  @ApiOperation({ summary: 'Place a bid on an auction' })
  @ApiResponse({ status: 201, description: 'Bid placed successfully' })
  @ApiResponse({ status: 400, description: ERROR_MESSAGES.BID_TOO_LOW })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.BID_ITEM_OWNER })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.AUCTION_NOT_FOUND })
  placeBid(
    @Param('auctionId') id: string,
    @Body() createBidDto: CreateBidDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.bidsService.placeBid(id, userId, createBidDto);
  }
}
