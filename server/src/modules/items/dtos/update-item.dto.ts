import { IsOptional, IsString, MinLength } from 'class-validator';
import { CreateItemDto } from './create-item.dto';
import { OmitType, PartialType } from '@nestjs/swagger';

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
