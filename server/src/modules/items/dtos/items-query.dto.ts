import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dtos';

export class ItemsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  sellerId?: string;
}
