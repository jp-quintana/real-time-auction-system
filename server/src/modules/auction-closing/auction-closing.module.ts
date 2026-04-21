import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TOKEN_AUCTION_CLOSING_QUEUE } from 'src/common/constants';
import { AuctionClosingProcessor } from './auction-closing.processor';
import { AuctionClosingService } from './auction-closing.service';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BidsCacheModule } from '../bids-cache/bids-cache.module';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: TOKEN_AUCTION_CLOSING_QUEUE,
    }),
    NotificationsModule,
    BidsCacheModule,
  ],
  providers: [AuctionClosingProcessor, AuctionClosingService],
  exports: [BullModule],
})
export class AuctionClosingModule {}
