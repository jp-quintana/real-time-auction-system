import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as auctionsSchema from '../auctions/schemas';
import {
  AUCTION_CLOSING_QUEUE,
  AUCTION_STATUS_ACTIVE,
  AUCTION_STATUS_CANCELLED,
  DATABASE_CONNECTION,
  ERROR_MESSAGES,
  EVENT_AUCTION_CANCELLED,
} from 'src/common/constants';
import type { Database } from 'src/common/types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BidsCacheService } from '../bids-cache/bids-cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    @InjectQueue(AUCTION_CLOSING_QUEUE)
    private readonly auctionClosingQueue: Queue,
    private readonly bidsCacheService: BidsCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async freezeAuction(auctionId: string) {
    const cancelledTransaction = await this.db.transaction(async (tx) => {
      const [auction] = await tx
        .select()
        .from(auctionsSchema.auctions)
        .where(
          and(
            isNull(auctionsSchema.auctions.deletedAt),
            eq(auctionsSchema.auctions.id, auctionId),
            eq(auctionsSchema.auctions.status, AUCTION_STATUS_ACTIVE),
            sql`${auctionsSchema.auctions.endTime} > now()`,
          ),
        )
        .for('update');

      if (!auction)
        throw new NotFoundException(ERROR_MESSAGES.AUCTION_NOT_FOUND);

      const [cancelledTransaction] = await tx
        .update(auctionsSchema.auctions)
        .set({
          status: AUCTION_STATUS_CANCELLED,
        })
        .where(eq(auctionsSchema.auctions.id, auctionId))
        .returning();

      return cancelledTransaction;
    });

    const existingJob = await this.auctionClosingQueue.getJob(auctionId);
    if (existingJob) await existingJob.remove();

    await this.bidsCacheService.removeHighestBid(auctionId);

    this.eventEmitter.emit('auction:cancelled', {
      auctionId: cancelledTransaction.id,
      reason: 'admin-freeze',
    });
  }
}
