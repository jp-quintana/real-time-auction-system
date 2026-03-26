import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { TOKENS } from 'src/common/constants';
import * as usersSchema from '../users/schemas';
import * as sessionsSchema from '../auth/schemas';

@Module({
  providers: [
    {
      provide: TOKENS.INFRA.DATABASE_CONNECTION,
      useFactory: (config: ConfigService) => {
        const pool = new Pool({
          connectionString: config.getOrThrow('DATABASE_URL'),
        });

        return drizzle(pool, {
          schema: {
            ...usersSchema,
            ...sessionsSchema,
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [TOKENS.INFRA.DATABASE_CONNECTION],
})
export class DatabaseModule {}
