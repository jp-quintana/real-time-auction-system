import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuctionsQueryDto, CreateAuctionDto } from './dtos';
import * as auctionsSchema from './schemas';
import { and, desc, eq, gt, gte, isNull, notExists, sql } from 'drizzle-orm';
import {
  AuctionsQueryRelations,
  type Database,
  Transaction,
} from 'src/common/types';
import {
  AUCTION_CLOSING_QUEUE_TOKEN,
  DATABASE_CONNECTION_TOKEN,
  DEFAULT_PAGE_SIZE,
  ERROR_MESSAGES,
} from 'src/common/constants';
import { ItemsService } from '../items/items.service';
import { UpdateAuctionDto } from './dtos/update-auction.dto';
import * as bidsSchema from '../bids/schemas';
import * as itemsSchema from '../items/schemas';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  AUCTION_SORT_CREATED_AT_ASC,
  AUCTION_SORT_CREATED_AT_DESC,
  AUCTION_SORT_ENDING_SOONEST,
  AUCTION_STATUS_ACTIVE,
} from './constants';

@Injectable()
export class AuctionsService {
  constructor(
    @Inject(DATABASE_CONNECTION_TOKEN)
    private readonly db: Database,
    private readonly itemsService: ItemsService,
    @InjectQueue(AUCTION_CLOSING_QUEUE_TOKEN)
    private readonly auctionClosingQueue: Queue,
  ) {}

  async findAll(
    auctionsQueryDto: AuctionsQueryDto,
    relations: AuctionsQueryRelations = { item: true, bids: false },
  ) {
    const page = auctionsQueryDto.page || 1;
    const pageSize = auctionsQueryDto.pageSize || DEFAULT_PAGE_SIZE;

    return await this.db.query.auctions.findMany({
      where: and(
        isNull(auctionsSchema.auctions.deletedAt),
        auctionsQueryDto.status
          ? eq(auctionsSchema.auctions.status, auctionsQueryDto.status)
          : undefined,
        auctionsQueryDto.sort === AUCTION_SORT_ENDING_SOONEST
          ? gte(auctionsSchema.auctions.endTime, new Date())
          : undefined,
      ),
      orderBy: (auctions, { asc, desc }) => {
        switch (auctionsQueryDto.sort) {
          case AUCTION_SORT_CREATED_AT_ASC:
            return asc(auctions.createdAt);
          case AUCTION_SORT_CREATED_AT_DESC:
            return desc(auctions.createdAt);
          case AUCTION_SORT_ENDING_SOONEST:
            return asc(auctions.endTime);
          default:
            return desc(auctions.createdAt);
        }
      },
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: {
        ...(relations.item && {
          item: true,
        }),
        ...(relations.bids && {
          bids: true,
        }),
      },
    });
  }

  async findOneById(
    auctionId: string,
    relations: AuctionsQueryRelations = { item: true, bids: false },
  ) {
    const auction = await this.db.query.auctions.findFirst({
      where: eq(auctionsSchema.auctions.id, auctionId),
      with: {
        ...(relations.item && {
          item: true,
        }),
        ...(relations.bids && {
          bids: {
            orderBy: [desc(bidsSchema.bids.amount)],
          },
        }),
      },
    });

    if (!auction || auction.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.AUCTION_NOT_FOUND);

    return auction;
  }

  async lockByIdForUpdate(auctionId: string, tx: Transaction) {
    const [auctionAndItem] = await tx
      .select({
        auction: auctionsSchema.auctions,
        item: itemsSchema.items,
      })
      .from(auctionsSchema.auctions)
      .innerJoin(
        itemsSchema.items,
        eq(itemsSchema.items.id, auctionsSchema.auctions.itemId),
      )
      .where(
        and(
          eq(auctionsSchema.auctions.id, auctionId),
          eq(auctionsSchema.auctions.status, AUCTION_STATUS_ACTIVE),
          sql`${auctionsSchema.auctions.endTime} > now()`,
        ),
      )
      .for('update', { of: auctionsSchema.auctions });

    if (!auctionAndItem || auctionAndItem.auction.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.AUCTION_NOT_FOUND);

    return { ...auctionAndItem.auction, item: auctionAndItem.item };
  }

  async create(sellerId: string, createAuctionDto: CreateAuctionDto) {
    const auction = await this.db.transaction(async (tx) => {
      const item = await this.itemsService.lockByIdForUpdate(
        createAuctionDto.itemId,
        tx,
      );

      if (!item) {
        throw new NotFoundException(ERROR_MESSAGES.ITEM_NOT_FOUND);
      }

      if (item.sellerId !== sellerId) {
        throw new ForbiddenException(ERROR_MESSAGES.ITEM_NOT_OWNER);
      }

      try {
        const [auction] = await tx
          .insert(auctionsSchema.auctions)
          .values({
            ...createAuctionDto,
            startingPrice: createAuctionDto.startingPrice.toString(),
          })
          .returning();

        return auction;
      } catch (error: any) {
        if (error.cause.code === '23505') {
          throw new ConflictException(ERROR_MESSAGES.AUCTION_FOR_ITEM_ACTIVE);
        }
        throw error;
      }
    });

    await this.auctionClosingQueue.add(
      'close',
      { auctionId: auction.id },
      { delay: auction.endTime.getTime() - Date.now(), jobId: auction.id },
    );

    return auction;
  }

  async update(
    auctionId: string,
    sellerId: string,
    updateAuctionDto: UpdateAuctionDto,
  ) {
    if (Object.keys(updateAuctionDto).length === 0)
      throw new BadRequestException(ERROR_MESSAGES.MISSING_PROPERTIES);

    const auction = await this.findOneById(auctionId, { item: true });

    if (auction.item.sellerId !== sellerId)
      throw new ForbiddenException(ERROR_MESSAGES.ITEM_NOT_OWNER);

    if (
      updateAuctionDto.endTime !== undefined &&
      updateAuctionDto.endTime <= auction.endTime
    )
      throw new ConflictException(ERROR_MESSAGES.AUCTION_NEW_TIME_IN_PAST);

    const conditions = [
      eq(auctionsSchema.auctions.id, auctionId),
      eq(auctionsSchema.auctions.status, AUCTION_STATUS_ACTIVE),
      sql`${auctionsSchema.auctions.endTime} > now()`,
    ];

    if (updateAuctionDto.startingPrice !== undefined) {
      conditions.push(
        notExists(
          this.db
            .select()
            .from(bidsSchema.bids)
            .where(eq(bidsSchema.bids.auctionId, auctionId)),
        ),
      );
    }

    if (updateAuctionDto.endTime !== undefined) {
      conditions.push(
        gt(
          sql`${updateAuctionDto.endTime}::timestamptz`,
          auctionsSchema.auctions.endTime,
        ),
      );
    }

    const [updated] = await this.db
      .update(auctionsSchema.auctions)
      .set({
        ...(updateAuctionDto.endTime !== undefined && {
          endTime: updateAuctionDto.endTime,
        }),
        ...(updateAuctionDto.startingPrice !== undefined && {
          startingPrice: updateAuctionDto.startingPrice.toString(),
        }),
      })
      .where(and(...conditions))
      .returning();

    if (!updated)
      throw new ConflictException(ERROR_MESSAGES.AUCTION_UPDATE_FAIL);

    if (updated.endTime.getTime() !== auction.endTime.getTime()) {
      const existingJob = await this.auctionClosingQueue.getJob(auctionId);
      if (existingJob) await existingJob.remove();
      await this.auctionClosingQueue.add(
        'close',
        { auctionId: auction.id },
        { delay: updated.endTime.getTime() - Date.now(), jobId: auction.id },
      );
    }

    return updated;
  }

  async remove(auctionId: string, sellerId: string) {
    const auction = await this.findOneById(auctionId, { item: true });

    if (auction.item.sellerId !== sellerId)
      throw new ForbiddenException(ERROR_MESSAGES.ITEM_NOT_OWNER);

    if (auction.status !== AUCTION_STATUS_ACTIVE) {
      throw new ConflictException(ERROR_MESSAGES.AUCTION_NOT_ACTIVE);
    }

    if (auction.endTime <= new Date())
      throw new ConflictException(ERROR_MESSAGES.AUCTION_COMPLETE);

    const [deleted] = await this.db
      .update(auctionsSchema.auctions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          isNull(auctionsSchema.auctions.deletedAt),
          eq(auctionsSchema.auctions.id, auctionId),
          eq(auctionsSchema.auctions.status, AUCTION_STATUS_ACTIVE),
          sql`${auctionsSchema.auctions.endTime} > now()`,
          notExists(
            this.db
              .select()
              .from(bidsSchema.bids)
              .where(eq(bidsSchema.bids.auctionId, auctionId)),
          ),
        ),
      )
      .returning();

    if (!deleted)
      throw new ConflictException(ERROR_MESSAGES.AUCTION_DELETE_FAIL);

    const existingJob = await this.auctionClosingQueue.getJob(auctionId);
    if (existingJob) await existingJob.remove();

    return deleted;
  }
}
