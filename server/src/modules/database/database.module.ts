import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { TOKENS } from 'src/common/constants';
import * as userSchema from '../users/schemas';

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
            ...userSchema,
          },
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class DatabaseModule {}
