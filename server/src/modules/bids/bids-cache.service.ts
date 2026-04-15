import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  AUCTION_HIGHEST_BID_KEY_SUFFIX,
  AUCTION_KEY_PREFIX,
  CACHE_CONNECTION,
} from 'src/common/constants';
import Redis from 'ioredis';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    updateHighestBidIfHigher(key: string, amount: string): Promise<'1' | '0'>;
  }
}

@Injectable()
export class BidsCacheService implements OnModuleInit {
  constructor(
    @Inject(CACHE_CONNECTION)
    private readonly cache: Redis,
  ) {}

  onModuleInit() {
    this.cache.defineCommand('updateHighestBidIfHigher', {
      numberOfKeys: 1,
      lua: `
        local current = redis.call('GET', KEYS[1])
        local incoming = tonumber(ARGV[1])
        if current == false or tonumber(current) < incoming then
          redis.call('SET', KEYS[1], ARGV[1], 'KEEPTTL')
          return 1
        end
        return 0
      `,
    });
  }

  private key(auctionId: string) {
    return `${AUCTION_KEY_PREFIX}:${auctionId}:${AUCTION_HIGHEST_BID_KEY_SUFFIX}`;
  }

  async getCachedHighestBid(auctionId: string): Promise<number | null> {
    const value = await this.cache.get(this.key(auctionId));
    return value === null ? null : Number(value);
  }

  async setHighestBidIfHigher(
    auctionId: string,
    amount: number,
    auctionEndTime: Date,
  ): Promise<void> {
    const key = this.key(auctionId);
    const ttlSeconds = this.computeBidCacheTtl(auctionEndTime);
    const updated = await this.cache.updateHighestBidIfHigher(
      key,
      amount.toString(),
    );

    if (updated === '1') {
      await this.cache.expire(key, ttlSeconds, 'NX');
    }
  }

  private computeBidCacheTtl(auctionEndTime: Date): number {
    const bufferHours = 3;
    const endMs = auctionEndTime.getTime();
    const nowMs = Date.now();
    const ttlMs = endMs - nowMs + bufferHours * 60 * 60 * 1000;
    return Math.max(60, Math.floor(ttlMs / 1000));
  }
}
