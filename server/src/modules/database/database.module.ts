import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as usersSchema from '../users/schemas';
import * as sessionsSchema from '../auth/schemas';
import * as itemsSchema from '../items/schemas';
import * as auctionsSchema from '../auctions/schemas';
import * as bidsSchema from '../bids/schemas';
import { DATABASE_CONNECTION } from 'src/common/constants';

@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (config: ConfigService) => {
        const pool = new Pool({
          connectionString: config.getOrThrow('DATABASE_URL'),
        });

        return drizzle(pool, {
          schema: {
            ...usersSchema,
            ...sessionsSchema,
            ...itemsSchema,
            ...auctionsSchema,
            ...bidsSchema,
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
