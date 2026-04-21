import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CACHE_CONNECTION_TOKEN } from 'src/common/constants';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_CONNECTION_TOKEN,
      useFactory: (config: ConfigService) => {
        return new Redis(config.getOrThrow('REDIS_CACHE_URL'), {
          maxRetriesPerRequest: 3,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [CACHE_CONNECTION_TOKEN],
})
export class CacheModule {}
