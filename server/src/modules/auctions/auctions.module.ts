import { Module } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { ItemsModule } from '../items/items.module';
import { AuctionsGateway } from './auctions.gateway';
import { AuthModule } from '../auth/auth.module';
import { AUCTION_CLOSING_QUEUE } from 'src/common/constants';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    DatabaseModule,
    JwtModule,
    ItemsModule,
    AuthModule,
    BullModule.registerQueue({
      name: AUCTION_CLOSING_QUEUE,
    }),
  ],
  providers: [AuctionsService, AuctionsGateway],
  controllers: [AuctionsController],
  exports: [AuctionsService],
})
export class AuctionsModule {}
