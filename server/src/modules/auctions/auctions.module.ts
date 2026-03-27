import { Module } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';

@Module({
  providers: [AuctionsService],
  controllers: [AuctionsController]
})
export class AuctionsModule {}
