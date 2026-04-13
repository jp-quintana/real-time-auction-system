import { Module } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { ItemsModule } from '../items/items.module';

@Module({
  imports: [DatabaseModule, JwtModule, ItemsModule],
  providers: [AuctionsService],
  controllers: [AuctionsController],
  exports: [AuctionsService],
})
export class AuctionsModule {}
