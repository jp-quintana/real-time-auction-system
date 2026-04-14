import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DATABASE_CONNECTION, ERROR_MESSAGES } from 'src/common/constants';
import { CreateBidDto } from './dtos';
import { AuctionsService } from '../auctions/auctions.service';
import { type Database } from 'src/common/types';
import * as bidsSchema from './schemas';
import { desc, eq } from 'drizzle-orm';
import { BidsCacheService } from './bids-cache.service';

@Injectable()
export class BidsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly bidsCacheService: BidsCacheService,
    private readonly auctionsService: AuctionsService,
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

    const { bid, auctionEndTime } = await this.db.transaction(async (tx) => {
      const auction = await this.auctionsService.lockByIdForUpdate(
        auctionId,
        tx,
      );

      if (auction.item.sellerId === bidderId) {
        throw new ForbiddenException(ERROR_MESSAGES.BID_ITEM_OWNER);
      }

      const [highestBid] = await tx
        .select({ amount: bidsSchema.bids.amount })
        .from(bidsSchema.bids)
        .where(eq(bidsSchema.bids.auctionId, auctionId))
        .orderBy(desc(bidsSchema.bids.amount))
        .limit(1);

      const currentPrice = highestBid
        ? Number(highestBid.amount)
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

      return { bid, auctionEndTime: auction.endTime };
    });

    try {
      await this.bidsCacheService.setHighestBidIfHigher(
        auctionId,
        createBidDto.amount,
        auctionEndTime,
      );
    } catch (err) {
      console.error('Failed to update bid cache after commit', err);
    }

    return bid;
  }
}
