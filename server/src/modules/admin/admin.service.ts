import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as auctionsSchema from '../auctions/schemas';
import {
  TOKEN_AUCTION_CLOSING_QUEUE,
  TOKEN_DATABASE_CONNECTION,
  ERROR_MESSAGES,
  EVENT_AUCTION_SUSPENDED,
  EVENT_AUCTION_RESUMED,
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
  AUCTION_STATUS_SUSPENDED,
} from '../auctions/constants';

@Injectable()
export class AdminService {
  constructor(
    @Inject(TOKEN_DATABASE_CONNECTION)
    private readonly db: Database,
    @InjectQueue(TOKEN_AUCTION_CLOSING_QUEUE)
    private readonly auctionClosingQueue: Queue,
    private readonly bidsCacheService: BidsCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async freezeAuction(auctionId: string, freezeAuctionDto: FreezeAuctionDto) {
    const { freezeReason } = freezeAuctionDto;

    const suspendedAuction = await this.db.transaction(async (tx) => {
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

      const [suspendedAuction] = await tx
        .update(auctionsSchema.auctions)
        .set({
          status: AUCTION_STATUS_SUSPENDED,
        })
        .where(eq(auctionsSchema.auctions.id, auctionId))
        .returning();

      return suspendedAuction;
    });

    const existingJob = await this.auctionClosingQueue.getJob(auctionId);
    if (existingJob) await existingJob.remove();

    await this.bidsCacheService.removeHighestBid(auctionId);

    this.eventEmitter.emit(EVENT_AUCTION_SUSPENDED, {
      auctionId: suspendedAuction.id,
      reason: freezeReason ?? 'admin-freeze',
    });

    return suspendedAuction;
  }

  async unfreezeAuction(auctionId: string) {
    const resumedAuction = await this.db.transaction(async (tx) => {
      const [auction] = await tx
        .select()
        .from(auctionsSchema.auctions)
        .where(
          and(
            isNull(auctionsSchema.auctions.deletedAt),
            eq(auctionsSchema.auctions.id, auctionId),
            eq(auctionsSchema.auctions.status, AUCTION_STATUS_SUSPENDED),
            sql`${auctionsSchema.auctions.endTime} > now()`,
          ),
        )
        .for('update');

      if (!auction)
        throw new NotFoundException(ERROR_MESSAGES.AUCTION_NOT_FOUND);

      const [resumedAuction] = await tx
        .update(auctionsSchema.auctions)
        .set({
          status: AUCTION_STATUS_ACTIVE,
        })
        .where(eq(auctionsSchema.auctions.id, auctionId))
        .returning();

      return resumedAuction;
    });

    await this.auctionClosingQueue.add(
      'close',
      { auctionId: resumedAuction.id },
      {
        delay: resumedAuction.endTime.getTime() - Date.now(),
        jobId: resumedAuction.id,
      },
    );

    this.eventEmitter.emit(EVENT_AUCTION_RESUMED, {
      auctionId: resumedAuction.id,
    });

    return resumedAuction;
  }
}
