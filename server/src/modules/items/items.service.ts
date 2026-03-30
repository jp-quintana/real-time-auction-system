import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PAGINATION, TOKENS } from 'src/common/constants';
import * as itemsSchema from './schemas';
import { CreateItemDto } from './dtos';
import { and, eq, isNull } from 'drizzle-orm';
import { ItemsQueryDto } from './dtos/items-query.dto';

@Injectable()
export class ItemsService {
  constructor(
    @Inject(TOKENS.INFRA.DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof itemsSchema>,
  ) {}

  async findAll(itemsQueryDto: ItemsQueryDto) {
    const page = itemsQueryDto.page || 1;
    const pageSize = itemsQueryDto.pageSize || PAGINATION.DEFAULT_PAGE_SIZE;

    return await this.db.query.items.findMany({
      where: and(
        isNull(itemsSchema.items.deletedAt),
        itemsQueryDto.sellerId
          ? eq(itemsSchema.items.sellerId, itemsQueryDto.sellerId)
          : undefined,
      ),
      orderBy: (items, { desc }) => desc(items.createdAt),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: {
        seller: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  async create(createItemDto: CreateItemDto) {
    return this.db.insert(itemsSchema.items).values(createItemDto).returning();
  }
}
