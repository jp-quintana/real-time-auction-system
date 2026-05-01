import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TOKEN_CACHE_CONNECTION } from 'src/common/constants';

@Global()
@Module({
  providers: [
    {
      provide: TOKEN_CACHE_CONNECTION,
      useFactory: (config: ConfigService) => {
        return new Redis(config.getOrThrow('REDIS_CACHE_URL'), {
          maxRetriesPerRequest: 3,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [TOKEN_CACHE_CONNECTION],
})
export class CacheModule {}
