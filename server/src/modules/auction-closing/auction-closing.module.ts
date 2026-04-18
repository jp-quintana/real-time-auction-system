import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AUCTION_CLOSING_QUEUE } from 'src/common/constants';
import { AuctionClosingProcessor } from './auction-closing.processor';
import { AuctionClosingService } from './auction-closing.service';
import { DatabaseModule } from '../database/database.module';
import { BidsModule } from '../bids/bids.module';

@Module({
  imports: [
    DatabaseModule,
    BidsModule,
    BullModule.registerQueue({
      name: AUCTION_CLOSING_QUEUE,
    }),
  ],
  providers: [AuctionClosingProcessor, AuctionClosingService],
})
export class AuctionClosingModule {}
