import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/common/constants';
import { CreateBidDto } from './dtos';
import { AuctionsService } from '../auctions/auctions.service';
import { type Database } from 'src/common/types';

@Injectable()
export class BidsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly auctionsService: AuctionsService,
  ) {}
  async placeBid(
    auctionId: string,
    bidderId: string,
    createBidDto: CreateBidDto,
  ) {
    return await this.db.transaction(async (tx) => {
      const auction = await this.auctionsService.lockByIdForUpdate(
        auctionId,
        tx,
      );
    });
  }
}
