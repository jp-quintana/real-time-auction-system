import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { AuctionClosingModule } from '../auction-closing/auction-closing.module';
import { BidsCacheModule } from '../bids-cache/bids-cache.module';

@Module({
  imports: [JwtModule, DatabaseModule, AuctionClosingModule, BidsCacheModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
