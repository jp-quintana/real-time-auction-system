import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  TOKEN_CACHE_CONNECTION,
  USER_BANNED_KEY_PREFIX,
} from 'src/common/constants';
import { parseTimeToMs } from 'src/common/utils';

@Injectable()
export class UsersCacheService {
  constructor(
    @Inject(TOKEN_CACHE_CONNECTION)
    private readonly cache: Redis,
    private readonly configService: ConfigService,
  ) {}

  private banKey(userId: string) {
    return `${USER_BANNED_KEY_PREFIX}:${userId}`;
  }

  private banCacheTtl() {
    const ttlMs = parseTimeToMs(
      this.configService.getOrThrow('ACCESS_TOKEN_TTL'),
    );
    return Math.max(1, Math.floor(ttlMs / 1000));
  }

  async setBannedUser(userId: string): Promise<void> {
    const key = this.banKey(userId);
    const cacheTtl = this.banCacheTtl();
    await this.cache.set(key, '1', 'EX', cacheTtl);
  }

  async removeBannedUser(userId: string): Promise<void> {
    await this.cache.del(this.banKey(userId));
  }

  async isBannedUser(userId: string): Promise<boolean> {
    const exists = await this.cache.exists(this.banKey(userId));
    return exists === 1;
  }
}
