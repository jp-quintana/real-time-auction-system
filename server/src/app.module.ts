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
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { BidsCacheModule } from './modules/bids-cache/bids-cache.module';
import * as nodemailer from 'nodemailer';

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
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const isProd = config.getOrThrow('NODE_ENV') === 'production';

        let transport: any;

        if (isProd) {
          throw new Error('Production mail transport not configured');
        } else {
          const testAccount = await nodemailer.createTestAccount();
          transport = {
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          };
        }
        return {
          transport,
          defaults: {
            from: config.get('MAIL_FROM', '"Dev App" <noreply@dev.local>'),
          },
        };
      },
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
    NotificationsModule,
    BidsCacheModule,
  ],
  controllers: [],
})
export class AppModule {}
