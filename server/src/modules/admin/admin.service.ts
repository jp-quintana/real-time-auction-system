import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as auctionsSchema from '../auctions/schemas';
import * as usersSchema from '../users/schemas';
import * as sessionsSchema from '../auth/schemas';
import * as bidsSchema from '../bids/schemas';
import {
  TOKEN_AUCTION_CLOSING_QUEUE,
  TOKEN_DATABASE_CONNECTION,
  ERROR_MESSAGES,
  EVENT_AUCTION_SUSPENDED,
  EVENT_AUCTION_RESUMED,
  EVENT_AUCTION_CANCELLED,
  JOB_AUCTION_CLOSE,
  DEFAULT_PAGE_SIZE,
  SUSPICIOUS_BID_THRESHOLD,
} from 'src/common/constants';
import type { Database } from 'src/common/types';
import { and, desc, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BidsCacheService } from '../bids-cache/bids-cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FreezeAuctionDto } from './dtos/freeze-auction.dto';
import {
  AUCTION_CANCELLED_ADMIN_CANCEL,
  AUCTION_SORT_CREATED_AT_ASC,
  AUCTION_SORT_CREATED_AT_DESC,
  AUCTION_SORT_ENDING_SOONEST,
  AUCTION_STATUS_ACTIVE,
  AUCTION_STATUS_CANCELLED,
  AUCTION_STATUS_SUSPENDED,
  AUCTION_SUSPENDED_ADMIN_FREEZE,
} from '../auctions/constants';
import {
  AdminAuctionsQueryDto,
  AdminSuspiciousAuctionsQueryDto,
  CancelAuctionDto,
} from './dtos';
import { UsersCacheService } from '../users-cache/users-cache.service';

@Injectable()
export class AdminService {
  constructor(
    @Inject(TOKEN_DATABASE_CONNECTION)
    private readonly db: Database,
    @InjectQueue(TOKEN_AUCTION_CLOSING_QUEUE)
    private readonly auctionClosingQueue: Queue,
    private readonly bidsCacheService: BidsCacheService,
    private readonly eventEmitter: EventEmitter2,
    private readonly usersCacheService: UsersCacheService,
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

  async banUser(userId: string) {
    const bannedUser = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(usersSchema.users)
        .where(
          and(
            eq(usersSchema.users.id, userId),
            isNull(usersSchema.users.deletedAt),
            isNull(usersSchema.users.bannedAt),
          ),
        )
        .for('update');

      if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

      const [bannedUser] = await tx
        .update(usersSchema.users)
        .set({ bannedAt: new Date() })
        .where(eq(usersSchema.users.id, userId))
        .returning();

      await tx
        .update(sessionsSchema.sessions)
        .set({ deletedAt: new Date() })
        .where(eq(sessionsSchema.sessions.userId, userId));

      return bannedUser;
    });

    try {
      await this.usersCacheService.setBannedUser(userId);
    } catch (err) {
      console.error('Failed to set banned user cache after ban commit', err);
    }

    return bannedUser;
  }

  async unbanUser(userId: string) {
    const [unbannedUser] = await this.db
      .update(usersSchema.users)
      .set({
        bannedAt: null,
      })
      .where(
        and(
          eq(usersSchema.users.id, userId),
          isNull(usersSchema.users.deletedAt),
          isNotNull(usersSchema.users.bannedAt),
        ),
      )
      .returning();

    if (!unbannedUser)
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    try {
      await this.usersCacheService.removeBannedUser(userId);
    } catch (err) {
      console.error(
        'Failed to remove banned user cache after unban commit',
        err,
      );
    }

    return unbannedUser;
  }

  async findAll(adminAuctionsQueryDto: AdminAuctionsQueryDto) {
    const page = adminAuctionsQueryDto.page || 1;
    const pageSize = adminAuctionsQueryDto.pageSize || DEFAULT_PAGE_SIZE;

    return await this.db.query.auctions.findMany({
      where: and(
        isNull(auctionsSchema.auctions.deletedAt),
        adminAuctionsQueryDto.status
          ? eq(auctionsSchema.auctions.status, adminAuctionsQueryDto.status)
          : undefined,
        adminAuctionsQueryDto.sort === AUCTION_SORT_ENDING_SOONEST
          ? gte(auctionsSchema.auctions.endTime, new Date())
          : undefined,
      ),
      orderBy: (auctions, { asc, desc }) => {
        switch (adminAuctionsQueryDto.sort) {
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
        item: {
          with: {
            seller: {
              columns: { id: true, email: true },
            },
          },
        },
        bids: {
          orderBy: (bids, { desc }) => desc(bids.amount),
          limit: 1,
        },
      },
    });
  }

  // TODO: replace with a per-auction "bids-in-last-minute" counter in Redis (sliding window), incremented on each bid in the futrue
  async findAllSuspicious(
    adminSuspiciousAuctionsQueryDto: AdminSuspiciousAuctionsQueryDto,
  ) {
    const page = adminSuspiciousAuctionsQueryDto.page || 1;
    const pageSize =
      adminSuspiciousAuctionsQueryDto.pageSize || DEFAULT_PAGE_SIZE;

    const recentBids = this.db
      .select({
        auctionId: bidsSchema.bids.auctionId,
        bidCount: sql<number>`count(*)::int`.as('bid_count'),
      })
      .from(bidsSchema.bids)
      .where(sql`${bidsSchema.bids.createdAt} > now() - interval '1 minute'`)
      .groupBy(bidsSchema.bids.auctionId)
      .having(sql`count(*) > ${SUSPICIOUS_BID_THRESHOLD}`)
      .as('recent_bids');

    return this.db
      .select({
        auction: auctionsSchema.auctions,
        bidCount: recentBids.bidCount,
      })
      .from(auctionsSchema.auctions)
      .innerJoin(
        recentBids,
        eq(recentBids.auctionId, auctionsSchema.auctions.id),
      )
      .where(
        and(
          isNull(auctionsSchema.auctions.deletedAt),
          eq(auctionsSchema.auctions.status, AUCTION_STATUS_ACTIVE),
        ),
      )
      .orderBy(desc(recentBids.bidCount))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  }
}
