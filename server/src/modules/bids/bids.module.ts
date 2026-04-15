import { Module } from '@nestjs/common';
import { BidsService } from './bids.service';
import { BidsController } from './bids.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { AuctionsModule } from '../auctions/auctions.module';
import { CacheModule } from '../cache/cache.module';
import { BidsCacheService } from './bids-cache.service';

@Module({
  imports: [DatabaseModule, JwtModule, AuctionsModule, CacheModule],
  providers: [BidsService, BidsCacheService],
  controllers: [BidsController],
})
export class BidsModule {}
