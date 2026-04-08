import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuctionsQueryDto, CreateAuctionDto } from './dtos';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as auctionsSchema from './schemas';
import { and, desc, eq, gt, gte, isNull, notExists, sql } from 'drizzle-orm';
import { AuctionsQueryRelations } from 'src/common/types';
import {
  AUCTION_SORT_CREATED_AT_ASC,
  AUCTION_SORT_CREATED_AT_DESC,
  AUCTION_SORT_ENDING_SOONEST,
  AUCTION_STATUS_ACTIVE,
  DATABASE_CONNECTION,
  DEFAULT_PAGE_SIZE,
} from 'src/common/constants';
import { ItemsService } from '../items/items.service';
import * as bidsSchema from '../bids/schemas';
import { UpdateAuctionDto } from './dtos/update-auction.dto';

@Injectable()
export class AuctionsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof auctionsSchema>,
    private readonly itemsService: ItemsService,
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

    if (!auction || auction.deletedAt) throw new NotFoundException();

    return auction;
  }

  async create(sellerId: string, createAuctionDto: CreateAuctionDto) {
    return this.db.transaction(async (tx) => {
      const item = await this.itemsService.lockByIdForUpdate(
        createAuctionDto.itemId,
        tx,
      );

      if (!item) {
        throw new NotFoundException('Item not found');
      }

      if (item.sellerId !== sellerId) {
        throw new ForbiddenException('You do not own this item');
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
          throw new ConflictException(
            'An auction for this item is already active',
          );
        }
        throw error;
      }
    });
  }

  async update(
    auctionId: string,
    sellerId: string,
    updateAuctionDto: UpdateAuctionDto,
  ) {
    if (Object.keys(updateAuctionDto).length === 0)
      throw new BadRequestException('No properties provided');

    const auction = await this.findOneById(auctionId, { item: true });

    if (auction.item.sellerId !== sellerId) throw new ForbiddenException();

    if (
      updateAuctionDto.endTime !== undefined &&
      updateAuctionDto.endTime <= auction.endTime
    )
      throw new ConflictException(
        'New end time must be after current end time',
      );

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
      throw new ConflictException(
        'Auction cannot be updated in its current state',
      );

    return updated;
  }
}
