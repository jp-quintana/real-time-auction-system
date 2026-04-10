import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dtos';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ItemsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsString()
  sellerId?: string;
}
