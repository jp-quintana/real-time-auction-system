import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dtos';
import { type AuctionStatus, auctionStatuses } from 'src/common/types';

export class AuctionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(auctionStatuses)
  status?: AuctionStatus;
}
