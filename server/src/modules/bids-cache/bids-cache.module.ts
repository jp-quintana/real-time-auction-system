import { Module } from '@nestjs/common';
import { BidsCacheService } from './bids-cache.service';

@Module({
  providers: [BidsCacheService],
  exports: [BidsCacheService],
})
export class BidsCacheModule {}
