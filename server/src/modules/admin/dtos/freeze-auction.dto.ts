import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AUCTION_FREEZE_REASONS } from 'src/modules/auctions/constants';
import { type AuctionFreezeReason } from 'src/modules/auctions/types';

export class FreezeAuctionDto {
  @ApiPropertyOptional({ enum: AUCTION_FREEZE_REASONS })
  @IsOptional()
  @IsIn(AUCTION_FREEZE_REASONS)
  freezeReason?: AuctionFreezeReason;
}
