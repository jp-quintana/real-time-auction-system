import { IsIn, IsOptional } from 'class-validator';
import { AUCTION_CANCELLED_REASONS } from 'src/modules/auctions/constants';
import type { AuctionCancelledReason } from 'src/modules/auctions/types';

export class FreezeAuctionDto {
  @IsOptional()
  @IsIn(AUCTION_CANCELLED_REASONS)
  cancelReason?: AuctionCancelledReason;
}
