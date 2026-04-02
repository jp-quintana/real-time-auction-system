import { IsIn, IsOptional } from 'class-validator';
import {
  AUCTION_SORT_VALUES,
  AUCTION_STATUS_VALUES,
} from 'src/common/constants';
import { PaginationQueryDto } from 'src/common/dtos';
import { type AuctionSort, type AuctionStatus } from 'src/common/types';

export class AuctionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(AUCTION_STATUS_VALUES)
  status?: AuctionStatus;

  @IsOptional()
  @IsIn(AUCTION_SORT_VALUES)
  sort?: AuctionSort;
}
