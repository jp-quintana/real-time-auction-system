import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUCTION_STATUS_ACTIVE,
  AUCTION_STATUS_CLOSED,
  DATABASE_CONNECTION,
  ERROR_MESSAGES,
} from 'src/common/constants';
import type { Database } from 'src/common/types';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import * as auctionsSchema from '../auctions/schemas';
import * as bidsSchema from '../bids/schemas';
import * as usersSchema from '../users/schemas';
import { BidsCacheService } from '../bids/bids-cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AuctionClosingService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly bidsCacheService: BidsCacheService,
    private eventEmitter: EventEmitter2,
  ) {}

  async close(auctionId: string) {
    const { closedAuction, winner } = await this.db.transaction(async (tx) => {
      const [closedAuction] = await tx
        .update(auctionsSchema.auctions)
        .set({ status: AUCTION_STATUS_CLOSED })
        .where(
          and(
            isNull(auctionsSchema.auctions.deletedAt),
            eq(auctionsSchema.auctions.id, auctionId),
            eq(auctionsSchema.auctions.status, AUCTION_STATUS_ACTIVE),
            sql`${auctionsSchema.auctions.endTime} <= now()`,
          ),
        )
        .returning();

      if (!closedAuction)
        throw new NotFoundException(ERROR_MESSAGES.AUCTION_NOT_FOUND);

      const [winningBid] = await tx
        .select({
          bid: bidsSchema.bids,
          bidder: usersSchema.users,
        })
        .from(bidsSchema.bids)
        .innerJoin(
          usersSchema.users,
          eq(usersSchema.users.id, bidsSchema.bids.bidderId),
        )
        .where(eq(bidsSchema.bids.auctionId, auctionId))
        .orderBy(desc(bidsSchema.bids.amount))
        .limit(1);

      return {
        closedAuction,
        winner: winningBid ?? null,
      };
    });

    await this.bidsCacheService.removeHighestBid(closedAuction.id);
    this.eventEmitter.emit('auction.closed', {
      auction: closedAuction,
      winningBid: winner
        ? {
            amount: Number(winner.bid.amount),
            bidderEmail: winner.bidder.email,
          }
        : null,
    });
  }
}
