import { IsIn, IsOptional } from 'class-validator';
import { AUCTION_CANCEL_REASONS } from 'src/modules/auctions/constants';
import { type AuctionCancelReason } from 'src/modules/auctions/types';

export class CancelAuctionDto {
  @IsOptional()
  @IsIn(AUCTION_CANCEL_REASONS)
  cancelReason?: AuctionCancelReason;
}
