import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';
import {
  DATABASE_CONNECTION,
  CACHE_CONNECTION,
  PREFIX,
} from 'src/common/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';
import {
  setupTestCache,
  teardownTestCache,
  type TestCache,
} from './setup-test-cache';
import { eq, count } from 'drizzle-orm';
import * as bidsSchema from '../src/modules/bids/schemas';
import { BidsCacheService } from '../src/modules/bids/bids-cache.service';

function redisKey(auctionId: string) {
  return `auction:${auctionId}:highestBid`;
}

describe('Bids Cache (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDb;
  let testCache: TestCache;
  let bidsCacheService: BidsCacheService;

  let sellerCookies: string[];
  let bidderCookies: string[];

  const password = 'password123';

  beforeAll(async () => {
    testDb = await setupTestDb();
    testCache = await setupTestCache();

    process.env.REDIS_QUEUE_URL = testCache.connectionUri;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue(testDb.db)
      .overrideProvider(CACHE_CONNECTION)
      .useValue(testCache.client)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.use(cookieParser());
    await app.init();

    bidsCacheService = moduleFixture.get(BidsCacheService);

    // Register seller
    const sellerRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({
        email: `seller-cache-${Date.now()}@test.com`,
        password,
        confirmPassword: password,
      })
      .expect(201);
    sellerCookies = sellerRes.headers['set-cookie'] as unknown as string[];

    // Register bidder
    const bidderRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({
        email: `bidder-cache-${Date.now()}@test.com`,
        password,
        confirmPassword: password,
      })
      .expect(201);
    bidderCookies = bidderRes.headers['set-cookie'] as unknown as string[];
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await teardownTestCache(testCache);
    await teardownTestDb(testDb);
  }, 60_000);

  async function createAuction(startingPrice = 100): Promise<string> {
    const itemRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/items`)
      .set('Cookie', sellerCookies)
      .send({ title: `Cache Test Item ${Date.now()}`, description: 'test' })
      .expect(201);

    const auctionRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions`)
      .set('Cookie', sellerCookies)
      .send({
        itemId: itemRes.body[0].id,
        startingPrice,
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    return auctionRes.body.id;
  }

  async function getBidCount(auctionId: string): Promise<number> {
    const [row] = await testDb.db
      .select({ count: count() })
      .from(bidsSchema.bids)
      .where(eq(bidsSchema.bids.auctionId, auctionId));
    return row.count;
  }

  it('should populate the Redis cache after a successful bid', async () => {
    const auctionId = await createAuction(100);

    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 150 })
      .expect(201);

    const cached = await testCache.client.get(redisKey(auctionId));
    expect(cached).toBe('150');
  });

  it('should reject a bid below the cached highest bid without hitting Postgres', async () => {
    const auctionId = await createAuction(100);

    // Pre-populate cache as if someone already bid $100
    await testCache.client.set(redisKey(auctionId), '100');

    const bidsBefore = await getBidCount(auctionId);

    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 90 })
      .expect(400);

    expect(res.body.message).toBe('Bid amount is too low');

    const bidsAfter = await getBidCount(auctionId);
    expect(bidsAfter).toBe(bidsBefore);
  });

  it('should keep the higher value when two concurrent Lua updates race', async () => {
    const auctionId = 'lua-atomicity-test';
    const key = redisKey(auctionId);

    // Pre-populate cache at $100
    await testCache.client.set(key, '100');

    const futureEnd = new Date(Date.now() + 60 * 60 * 1000);

    // Fire both updates in parallel
    await Promise.all([
      bidsCacheService.setHighestBidIfHigher(auctionId, 105, futureEnd),
      bidsCacheService.setHighestBidIfHigher(auctionId, 103, futureEnd),
    ]);

    const cached = await testCache.client.get(key);
    expect(cached).toBe('105');
  });

  it('should fall back to Postgres on cache miss and populate the cache', async () => {
    const auctionId = await createAuction(100);

    // Ensure no cache key exists for this auction
    await testCache.client.del(redisKey(auctionId));

    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 200 })
      .expect(201);

    const cached = await testCache.client.get(redisKey(auctionId));
    expect(cached).toBe('200');
  });

  it('should reject a bid when cache is stale-low but Postgres has a higher bid', async () => {
    const auctionId = await createAuction(100);

    // Place a real bid at $300 through the API (this sets both DB and cache)
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 300 })
      .expect(201);

    // Manually set Redis to a stale low value
    await testCache.client.set(redisKey(auctionId), '50');

    // Bid $200: higher than Redis ($50) so it passes the cache pre-check,
    // but lower than Postgres ($300) so SELECT FOR UPDATE rejects it
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 200 })
      .expect(400);

    expect(res.body.message).toBe('Bid amount is too low');

    // Only the original $300 bid should exist
    const bidCount = await getBidCount(auctionId);
    expect(bidCount).toBe(1);
  });
});
