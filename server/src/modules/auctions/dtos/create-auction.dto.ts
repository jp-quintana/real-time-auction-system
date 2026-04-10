import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  MinDate,
} from 'class-validator';
import { IsAfter } from 'src/common/decorators';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAuctionDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 100, minimum: 1, maximum: 1_000_000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  startingPrice: number;

  @ApiPropertyOptional({
    type: 'string',
    format: 'date-time',
    description: 'Auction start time. Must be in the future.',
  })
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date())
  @IsOptional()
  startTime?: Date;

  @ApiProperty({
    type: 'string',
    format: 'date-time',
    description: 'Auction end time. Must be in the future and after startTime.',
  })
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date())
  @IsAfter('startTime')
  endTime: Date;
}
