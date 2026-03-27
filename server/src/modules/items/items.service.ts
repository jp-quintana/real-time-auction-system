import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { TOKENS } from 'src/common/constants';
import * as itemsSchema from './schemas';
import { CreateItemDto } from './dtos';

@Injectable()
export class ItemsService {
  constructor(
    @Inject(TOKENS.INFRA.DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof itemsSchema>,
  ) {}

  async create(createItemDto: CreateItemDto) {
    return this.db.insert(itemsSchema.items).values(createItemDto).returning();
  }
}
