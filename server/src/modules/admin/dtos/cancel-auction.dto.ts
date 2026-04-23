import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AUCTION_CANCEL_REASONS } from 'src/modules/auctions/constants';
import { type AuctionCancelReason } from 'src/modules/auctions/types';

export class CancelAuctionDto {
  @ApiPropertyOptional({ enum: AUCTION_CANCEL_REASONS })
  @IsOptional()
  @IsIn(AUCTION_CANCEL_REASONS)
  cancelReason?: AuctionCancelReason;
}
