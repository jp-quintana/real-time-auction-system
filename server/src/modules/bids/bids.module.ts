import { Module } from '@nestjs/common';
import { BidsService } from './bids.service';
import { BidsController } from './bids.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { AuctionsModule } from '../auctions/auctions.module';
import { CacheModule } from '../cache/cache.module';
import { BidsCacheService } from './bids-cache.service';
import { BullModule } from '@nestjs/bullmq';
import { NOTIFICATIONS_QUEUE } from 'src/common/constants';

@Module({
  imports: [
    DatabaseModule,
    JwtModule,
    AuctionsModule,
    CacheModule,
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
    }),
  ],
  providers: [BidsService, BidsCacheService],
  controllers: [BidsController],
  exports: [BidsCacheService],
})
export class BidsModule {}
