import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PAGINATION, TOKENS } from 'src/common/constants';
import * as itemsSchema from './schemas';
import { CreateItemDto } from './dtos';
import { isNull } from 'drizzle-orm';

@Injectable()
export class ItemsService {
  constructor(
    @Inject(TOKENS.INFRA.DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof itemsSchema>,
  ) {}

  async findAll(page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE) {
    return await this.db.query.items.findMany({
      where: isNull(itemsSchema.items.deletedAt),
      orderBy: (items, { desc }) => desc(items.createdAt),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  }

  async create(createItemDto: CreateItemDto) {
    return this.db.insert(itemsSchema.items).values(createItemDto).returning();
  }
}
