import { IsIn, IsOptional } from 'class-validator';
import { AUCTION_UPDATE_STATUS_REASONS } from 'src/modules/auctions/constants';
import type { AuctionCancelledReason } from 'src/modules/auctions/types';

export class FreezeAuctionDto {
  @IsOptional()
  @IsIn(AUCTION_UPDATE_STATUS_REASONS)
  freezeReason?: AuctionCancelledReason;
}
