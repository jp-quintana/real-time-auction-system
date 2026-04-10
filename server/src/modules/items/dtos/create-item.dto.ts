import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ example: 'Vintage watch', minLength: 3 })
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  title: string;

  @ApiPropertyOptional({ example: 'A rare 1960s Swiss watch in excellent condition.' })
  @IsOptional()
  @IsString()
  description?: string;
}
