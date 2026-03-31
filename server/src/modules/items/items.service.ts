import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PAGINATION, TOKENS } from 'src/common/constants';
import * as itemsSchema from './schemas';
import { CreateItemDto, ItemsQueryDto, UpdateItemDto } from './dtos';
import { and, eq, isNull } from 'drizzle-orm';

@Injectable()
export class ItemsService {
  constructor(
    @Inject(TOKENS.INFRA.DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof itemsSchema>,
  ) {}

  async findAll(itemsQueryDto: ItemsQueryDto, withSeller = true) {
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
      with: withSeller
        ? {
            seller: {
              columns: {
                id: true,
                email: true,
              },
            },
          }
        : undefined,
    });
  }

  async findOneById(itemId: string) {
    const item = await this.db.query.items.findFirst({
      where: eq(itemsSchema.items.id, itemId),
      with: {
        seller: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!item || item.deletedAt) throw new NotFoundException();

    return item;
  }

  async create(createItemDto: CreateItemDto) {
    return this.db.insert(itemsSchema.items).values(createItemDto).returning();
  }

  async update(itemId: string, sellerId: string, updateItemDto: UpdateItemDto) {
    const [updated] = await this.db
      .update(itemsSchema.items)
      .set(updateItemDto)
      .where(
        and(
          eq(itemsSchema.items.id, itemId),
          eq(itemsSchema.items.sellerId, sellerId),
          isNull(itemsSchema.items.deletedAt),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundException();

    return updated;
  }
}
