import { Module } from '@nestjs/common';
import { BidsService } from './bids.service';
import { BidsController } from './bids.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { AuctionsModule } from '../auctions/auctions.module';
import { CacheModule } from '../cache/cache.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BidsCacheModule } from '../bids-cache/bids-cache.module';

@Module({
  imports: [
    DatabaseModule,
    JwtModule,
    AuctionsModule,
    CacheModule,
    NotificationsModule,
    BidsCacheModule,
  ],
  providers: [BidsService],
  controllers: [BidsController],
})
export class BidsModule {}
