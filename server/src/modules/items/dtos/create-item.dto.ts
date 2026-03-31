import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import * as itemsSchema from '../schemas';

type Item = typeof itemsSchema.items.$inferInsert;

export class CreateItemDto implements Partial<Item> {
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Allow()
  sellerId: string;
}
