import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
