import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DATABASE_CONNECTION_TOKEN,
  DEFAULT_PAGE_SIZE,
  ERROR_MESSAGES,
} from 'src/common/constants';
import * as itemsSchema from './schemas';
import { CreateItemDto, ItemsQueryDto, UpdateItemDto } from './dtos';
import { and, eq, isNull } from 'drizzle-orm';
import {
  type Database,
  ItemsQueryRelations,
  type Transaction,
} from 'src/common/types';

@Injectable()
export class ItemsService {
  constructor(
    @Inject(DATABASE_CONNECTION_TOKEN)
    private readonly db: Database,
  ) {}

  async findAll(
    itemsQueryDto: ItemsQueryDto,
    relations: ItemsQueryRelations = { seller: true },
  ) {
    const page = itemsQueryDto.page || 1;
    const pageSize = itemsQueryDto.pageSize || DEFAULT_PAGE_SIZE;

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
        ...(relations.seller && {
          seller: { columns: { id: true, email: true } },
        }),
        ...(relations.auctions && {
          auctions: { columns: { id: true, status: true } },
        }),
      },
    });
  }

  async findOneById(
    itemId: string,
    relations: ItemsQueryRelations = { seller: true },
  ) {
    const item = await this.db.query.items.findFirst({
      where: eq(itemsSchema.items.id, itemId),
      with: {
        ...(relations.seller && {
          seller: { columns: { id: true, email: true } },
        }),
        ...(relations.auctions && {
          auctions: { columns: { id: true, status: true } },
        }),
      },
    });

    if (!item || item.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.ITEM_NOT_FOUND);

    return item;
  }

  async lockByIdForUpdate(itemId: string, tx: Transaction) {
    const [item] = await tx
      .select({
        id: itemsSchema.items.id,
        sellerId: itemsSchema.items.sellerId,
        deletedAt: itemsSchema.items.deletedAt,
      })
      .from(itemsSchema.items)
      .where(eq(itemsSchema.items.id, itemId))
      .for('update');

    if (!item || item.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.ITEM_NOT_FOUND);

    return item;
  }

  async create(sellerId: string, createItemDto: CreateItemDto) {
    return this.db
      .insert(itemsSchema.items)
      .values({ ...createItemDto, sellerId })
      .returning();
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

    if (!updated) throw new NotFoundException(ERROR_MESSAGES.ITEM_NOT_FOUND);

    return updated;
  }
}
