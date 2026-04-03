import { Inject, Injectable } from '@nestjs/common';
import { AuctionsQueryDto } from './dtos';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as auctionsSchema from './schemas';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { AuctionsQueryRelations } from 'src/common/types';
import {
  AUCTION_SORT_CREATED_AT_ASC,
  AUCTION_SORT_CREATED_AT_DESC,
  AUCTION_SORT_ENDING_SOONEST,
  DATABASE_CONNECTION,
  DEFAULT_PAGE_SIZE,
} from 'src/common/constants';

@Injectable()
export class AuctionsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof auctionsSchema>,
  ) {}

  async findAll(
    auctionsQueryDto: AuctionsQueryDto,
    relations: AuctionsQueryRelations = { item: false, bids: false },
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
}
