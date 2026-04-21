import { IsIn, IsOptional } from 'class-validator';
import { AUCTION_FREEZE_REASONS } from 'src/modules/auctions/constants';
import { type AuctionFreezeReason } from 'src/modules/auctions/types';

export class FreezeAuctionDto {
  @IsOptional()
  @IsIn(AUCTION_FREEZE_REASONS)
  freezeReason?: AuctionFreezeReason;
}
