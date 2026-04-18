import { Module } from '@nestjs/common';
import { DatabaseModule } from './modules/database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ItemsModule } from './modules/items/items.module';
import { AuctionsModule } from './modules/auctions/auctions.module';
import { BidsModule } from './modules/bids/bids.module';
import { CacheModule } from './modules/cache/cache.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuctionClosingModule } from './modules/auction-closing/auction-closing.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow('REDIS_QUEUE_URL'),
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    UsersModule,
    AuthModule,
    ItemsModule,
    AuctionsModule,
    BidsModule,
    CacheModule,
    AuctionClosingModule,
  ],
  controllers: [],
})
export class AppModule {}
