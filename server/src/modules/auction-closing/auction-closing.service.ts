import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TOKEN_DATABASE_CONNECTION,
  ERROR_MESSAGES,
  EVENT_AUCTION_CLOSED,
  TOKEN_NOTIFICATIONS_QUEUE,
} from 'src/common/constants';
import type { Database } from 'src/common/types';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import * as auctionsSchema from '../auctions/schemas';
import * as bidsSchema from '../bids/schemas';
import * as usersSchema from '../users/schemas';
import * as itemsSchema from '../items/schemas';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BidsCacheService } from '../bids-cache/bids-cache.service';
import {
  AUCTION_STATUS_ACTIVE,
  AUCTION_STATUS_CLOSED,
} from '../auctions/constants';

@Injectable()
export class AuctionClosingService {
  constructor(
    @Inject(TOKEN_DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly bidsCacheService: BidsCacheService,
    private eventEmitter: EventEmitter2,
    @InjectQueue(TOKEN_NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue,
  ) {}

  async close(auctionId: string) {
    const { closedAuction, winner, seller } = await this.db.transaction(
      async (tx) => {
        const [auctionAndSeller] = await tx
          .select({
            auction: auctionsSchema.auctions,
            seller: usersSchema.users,
          })
          .from(auctionsSchema.auctions)
          .where(
            and(
              isNull(auctionsSchema.auctions.deletedAt),
              eq(auctionsSchema.auctions.id, auctionId),
              eq(auctionsSchema.auctions.status, AUCTION_STATUS_ACTIVE),
              sql`${auctionsSchema.auctions.endTime} <= now()`,
            ),
          )
          .innerJoin(
            itemsSchema.items,
            eq(auctionsSchema.auctions.itemId, itemsSchema.items.id),
          )
          .innerJoin(
            usersSchema.users,
            eq(itemsSchema.items.sellerId, usersSchema.users.id),
          )
          .for('update');

        if (!auctionAndSeller)
          throw new NotFoundException(ERROR_MESSAGES.AUCTION_NOT_FOUND);

        const { seller } = auctionAndSeller;

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

        const [closedAuction] = await tx
          .update(auctionsSchema.auctions)
          .set({
            status: AUCTION_STATUS_CLOSED,
            winnerId: winningBid ? winningBid.bidder.id : null,
          })
          .where(eq(auctionsSchema.auctions.id, auctionId))
          .returning();

        return {
          closedAuction,
          winner: winningBid ?? null,
          seller,
        };
      },
    );

    await this.bidsCacheService.removeHighestBid(closedAuction.id);
    this.eventEmitter.emit(EVENT_AUCTION_CLOSED, {
      auctionId: closedAuction.id,
      winningBid: winner
        ? {
            amount: Number(winner.bid.amount),
            bidderEmail: winner.bidder.email,
          }
        : null,
    });

    if (winner) {
      await this.notificationsQueue.add('auction-won', {
        auctionId,
        winnerEmail: winner.bidder.email,
        winnerBidAmount: Number(winner.bid.amount),
      });
    }

    await this.notificationsQueue.add('auction-closed', {
      itemId: closedAuction.itemId,
      sellerEmail: seller.email,
      winnerId: winner?.bidder.id ?? null,
      winnerBidAmount: winner ? Number(winner.bid.amount) : null,
    });
  }
}
