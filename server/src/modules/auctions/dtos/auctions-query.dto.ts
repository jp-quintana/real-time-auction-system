import { IsIn, IsOptional } from 'class-validator';
import {
  AUCTION_SORT_VALUES,
  AUCTION_STATUS_VALUES,
} from 'src/common/constants';
import { PaginationQueryDto } from 'src/common/dtos';
import { type AuctionSort, type AuctionStatus } from 'src/common/types';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AuctionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AUCTION_STATUS_VALUES })
  @IsOptional()
  @IsIn(AUCTION_STATUS_VALUES)
  status?: AuctionStatus;

  @ApiPropertyOptional({ enum: AUCTION_SORT_VALUES })
  @IsOptional()
  @IsIn(AUCTION_SORT_VALUES)
  sort?: AuctionSort;
}
