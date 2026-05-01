import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dtos';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AUCTION_SORT_VALUES,
  AUCTION_STATUS_VALUES,
} from 'src/modules/auctions/constants';
import type { AuctionSort, AuctionStatus } from 'src/modules/auctions/types';

export class AdminAuctionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AUCTION_STATUS_VALUES })
  @IsOptional()
  @IsIn(AUCTION_STATUS_VALUES)
  status?: AuctionStatus;

  @ApiPropertyOptional({ enum: AUCTION_SORT_VALUES })
  @IsOptional()
  @IsIn(AUCTION_SORT_VALUES)
  sort?: AuctionSort;
}
