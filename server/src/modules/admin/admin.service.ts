import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as auctionsSchema from '../auctions/schemas';
import {
  TOKEN_AUCTION_CLOSING_QUEUE,
  TOKEN_DATABASE_CONNECTION,
  ERROR_MESSAGES,
  EVENT_AUCTION_SUSPENDED,
  EVENT_AUCTION_RESUMED,
  EVENT_AUCTION_CANCELLED,
  JOB_AUCTION_CLOSE,
} from 'src/common/constants';
import type { Database } from 'src/common/types';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BidsCacheService } from '../bids-cache/bids-cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FreezeAuctionDto } from './dtos/freeze-auction.dto';
import {
  AUCTION_CANCELLED_ADMIN_CANCEL,
  AUCTION_STATUS_ACTIVE,
  AUCTION_STATUS_CANCELLED,
  AUCTION_STATUS_SUSPENDED,
  AUCTION_SUSPENDED_ADMIN_FREEZE,
} from '../auctions/constants';
import { CancelAuctionDto } from './dtos';

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
      reason: freezeReason ?? AUCTION_SUSPENDED_ADMIN_FREEZE,
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
      JOB_AUCTION_CLOSE,
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

  async cancelAuction(auctionId: string, cancelAuctionDto: CancelAuctionDto) {
    const { cancelReason } = cancelAuctionDto;

    const cancelledAuction = await this.db.transaction(async (tx) => {
      const [auction] = await tx
        .select()
        .from(auctionsSchema.auctions)
        .where(
          and(
            isNull(auctionsSchema.auctions.deletedAt),
            eq(auctionsSchema.auctions.id, auctionId),
            or(
              eq(auctionsSchema.auctions.status, AUCTION_STATUS_ACTIVE),
              eq(auctionsSchema.auctions.status, AUCTION_STATUS_SUSPENDED),
            ),
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
      reason: cancelReason ?? AUCTION_CANCELLED_ADMIN_CANCEL,
    });

    return cancelledAuction;
  }
}
