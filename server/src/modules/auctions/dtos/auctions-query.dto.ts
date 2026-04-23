import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dtos';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AUCTION_SORT_VALUES, AUCTION_STATUS_VALUES } from '../constants';
import { type AuctionSort, type AuctionStatus } from '../types';

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
