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

export class CreateAuctionDto {
  @IsUUID()
  itemId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  startingPrice: number;

  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date())
  @IsOptional()
  startTime?: Date;

  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date())
  @IsAfter('startTime')
  endTime: Date;
}
