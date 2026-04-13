import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class CreateBidDto {
  @ApiProperty({ example: 100, minimum: 1, maximum: 1_000_000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  amount: number;
}
