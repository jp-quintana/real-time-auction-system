import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  DATABASE_CONNECTION,
  ERROR_MESSAGES,
  EVENT_BID_PLACED,
  NOTIFICATIONS_QUEUE,
} from 'src/common/constants';
import { CreateBidDto } from './dtos';
import { AuctionsService } from '../auctions/auctions.service';
import type { Database } from 'src/common/types';
import * as bidsSchema from './schemas';
import * as usersSchema from '../users/schemas';
import { desc, eq } from 'drizzle-orm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BidsCacheService } from '../bids-cache/bids-cache.service';

@Injectable()
export class BidsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly bidsCacheService: BidsCacheService,
    private readonly auctionsService: AuctionsService,
    private eventEmitter: EventEmitter2,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue,
  ) {}

  async placeBid(
    auctionId: string,
    bidderId: string,
    createBidDto: CreateBidDto,
  ) {
    const cachedHighestBid =
      await this.bidsCacheService.getCachedHighestBid(auctionId);

    if (cachedHighestBid !== null && cachedHighestBid >= createBidDto.amount) {
      throw new BadRequestException(ERROR_MESSAGES.BID_TOO_LOW);
    }

    const { bid, auctionEndTime, previousHighBid } = await this.db.transaction(
      async (tx) => {
        const auction = await this.auctionsService.lockByIdForUpdate(
          auctionId,
          tx,
        );

        if (auction.item.sellerId === bidderId) {
          throw new ForbiddenException(ERROR_MESSAGES.BID_ITEM_OWNER);
        }

        const [previousHighBid] = await tx
          .select({
            amount: bidsSchema.bids.amount,
            bidder: usersSchema.users,
          })
          .from(bidsSchema.bids)
          .where(eq(bidsSchema.bids.auctionId, auctionId))
          .innerJoin(
            usersSchema.users,
            eq(usersSchema.users.id, bidsSchema.bids.bidderId),
          )
          .orderBy(desc(bidsSchema.bids.amount))
          .limit(1);

        const currentPrice = previousHighBid
          ? Number(previousHighBid.amount)
          : Number(auction.startingPrice);

        if (createBidDto.amount <= currentPrice) {
          throw new BadRequestException(ERROR_MESSAGES.BID_TOO_LOW);
        }

        const [bid] = await tx
          .insert(bidsSchema.bids)
          .values({
            auctionId,
            bidderId,
            amount: createBidDto.amount.toString(),
          })
          .returning();

        return {
          bid,
          auctionEndTime: auction.endTime,
          previousHighBid: previousHighBid ?? null,
        };
      },
    );

    try {
      await this.bidsCacheService.setHighestBidIfHigher(
        auctionId,
        createBidDto.amount,
        auctionEndTime,
      );
    } catch (err) {
      console.error('Failed to update bid cache after commit', err);
    }

    this.eventEmitter.emit(EVENT_BID_PLACED, {
      bid: { ...bid, amount: Number(bid.amount) },
      auctionEndTime,
      previousHighBidderId: previousHighBid?.bidder.id ?? null,
    });

    if (previousHighBid) {
      await this.notificationsQueue.add('outbid', {
        auctionId,
        previousHighBidderEmail: previousHighBid.bidder.email,
        previousHighBidAmount: Number(previousHighBid.amount),
        newHighBidAmount: bid.amount,
      });
    }

    return bid;
  }
}
