import { Module } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { ItemsModule } from '../items/items.module';
import { AuctionsGateway } from './auctions.gateway';
import { AuthModule } from '../auth/auth.module';
import { AuctionClosingModule } from '../auction-closing/auction-closing.module';

@Module({
  imports: [
    DatabaseModule,
    JwtModule,
    ItemsModule,
    AuthModule,
    AuctionClosingModule,
  ],
  providers: [AuctionsService, AuctionsGateway],
  controllers: [AuctionsController],
  exports: [AuctionsService],
})
export class AuctionsModule {}
