import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AUCTION_CLOSING_QUEUE_TOKEN } from 'src/common/constants';
import { AuctionClosingProcessor } from './auction-closing.processor';
import { AuctionClosingService } from './auction-closing.service';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BidsCacheModule } from '../bids-cache/bids-cache.module';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: AUCTION_CLOSING_QUEUE_TOKEN,
    }),
    NotificationsModule,
    BidsCacheModule,
  ],
  providers: [AuctionClosingProcessor, AuctionClosingService],
  exports: [BullModule],
})
export class AuctionClosingModule {}
