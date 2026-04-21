import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as auctionsSchema from '../auctions/schemas';
import {
  AUCTION_CLOSING_QUEUE_TOKEN,
  DATABASE_CONNECTION_TOKEN,
  ERROR_MESSAGES,
  EVENT_AUCTION_CANCELLED,
} from 'src/common/constants';
import type { Database } from 'src/common/types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BidsCacheService } from '../bids-cache/bids-cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FreezeAuctionDto } from './dtos/freeze-auction.dto';
import {
  AUCTION_STATUS_ACTIVE,
  AUCTION_STATUS_CANCELLED,
} from '../auctions/constants';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE_CONNECTION_TOKEN)
    private readonly db: Database,
    @InjectQueue(AUCTION_CLOSING_QUEUE_TOKEN)
    private readonly auctionClosingQueue: Queue,
    private readonly bidsCacheService: BidsCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async freezeAuction(auctionId: string, freezeAuctionDto: FreezeAuctionDto) {
    const { cancelReason } = freezeAuctionDto;

    const cancelledAuction = await this.db.transaction(async (tx) => {
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

      const [cancelledAuction] = await tx
        .update(auctionsSchema.auctions)
        .set({
          status: AUCTION_STATUS_CANCELLED,
        })
        .where(eq(auctionsSchema.auctions.id, auctionId))
        .returning();

      return cancelledAuction;
    });

    const existingJob = await this.auctionClosingQueue.getJob(auctionId);
    if (existingJob) await existingJob.remove();

    await this.bidsCacheService.removeHighestBid(auctionId);

    this.eventEmitter.emit(EVENT_AUCTION_CANCELLED, {
      auctionId: cancelledAuction.id,
      reason: cancelReason ?? 'admin-freeze',
    });

    return cancelledAuction;
  }
}
