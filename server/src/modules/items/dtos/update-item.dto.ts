import { IsOptional, IsString, MinLength } from 'class-validator';
import { CreateItemDto } from './create-item.dto';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @ApiPropertyOptional({ example: 'Vintage watch', minLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  title?: string;

  @ApiPropertyOptional({ example: 'A rare 1960s Swiss watch in excellent condition.' })
  @IsOptional()
  @IsString()
  description?: string;
}
