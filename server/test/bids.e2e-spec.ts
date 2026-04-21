import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';
import { MailerService, MAILER_OPTIONS } from '@nestjs-modules/mailer';
import {
  DATABASE_CONNECTION_TOKEN,
  CACHE_CONNECTION_TOKEN,
  PREFIX,
} from 'src/common/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';
import {
  setupTestCache,
  teardownTestCache,
  type TestCache,
} from './setup-test-cache';
import { eq } from 'drizzle-orm';
import * as auctionsSchema from '../src/modules/auctions/schemas';
import * as bidsSchema from '../src/modules/bids/schemas';

describe('POST /auctions/:auctionId/bids (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDb;
  let testCache: TestCache;

  let sellerCookies: string[];
  let bidderCookies: string[];
  let auctionId: string;
  const startingPrice = 100;

  const sellerEmail = `seller-bids-${Date.now()}@test.com`;
  const bidderEmail = `bidder-bids-${Date.now()}@test.com`;
  const password = 'password123';

  beforeAll(async () => {
    testDb = await setupTestDb();
    testCache = await setupTestCache();

    process.env.REDIS_QUEUE_URL = testCache.connectionUri;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CONNECTION_TOKEN)
      .useValue(testDb.db)
      .overrideProvider(CACHE_CONNECTION_TOKEN)
      .useValue(testCache.client)
      .overrideProvider(MAILER_OPTIONS)
      .useValue({ transport: { jsonTransport: true } })
      .overrideProvider(MailerService)
      .useValue({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'stub' }),
      })
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

    // Register seller
    const sellerRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({
        email: sellerEmail,
        password,
        confirmPassword: password,
      })
      .expect(201);
    sellerCookies = sellerRes.headers['set-cookie'] as unknown as string[];

    // Register bidder
    const bidderRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({
        email: bidderEmail,
        password,
        confirmPassword: password,
      })
      .expect(201);
    bidderCookies = bidderRes.headers['set-cookie'] as unknown as string[];

    // Create item as seller
    const itemRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/items`)
      .set('Cookie', sellerCookies)
      .send({ title: 'Test Item for Bids', description: 'E2E test item' })
      .expect(201);

    // Create active auction for the item
    const endTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const auctionRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions`)
      .set('Cookie', sellerCookies)
      .send({
        itemId: itemRes.body[0].id,
        startingPrice,
        endTime: endTime.toISOString(),
      })
      .expect(201);
    auctionId = auctionRes.body.id;
  });

  afterAll(
    async () => {
      await app.close();
      await teardownTestCache(testCache);
      await teardownTestDb(testDb);
    },
    11 * 60 * 1000,
  );

  it('should place a valid bid and persist it in the bids table', async () => {
    const amount = 150;

    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount })
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      auctionId,
      amount: '150.00',
    });

    const [row] = await testDb.db
      .select()
      .from(bidsSchema.bids)
      .where(eq(bidsSchema.bids.id, res.body.id));

    expect(row).toBeDefined();
    expect(row.auctionId).toBe(auctionId);
    expect(row.amount).toBe('150.00');
  });

  it('should reject a bid equal to the current highest bid', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 150 })
      .expect(400);

    expect(res.body.message).toBe('Bid amount is too low');
  });

  it('should reject a bid lower than the current highest bid', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 120 })
      .expect(400);

    expect(res.body.message).toBe('Bid amount is too low');
  });

  it('should reject a bid on a closed auction', async () => {
    // Create a separate item + auction, then close it
    const itemRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/items`)
      .set('Cookie', sellerCookies)
      .send({ title: 'Closed Auction Item', description: 'Will be closed' })
      .expect(201);

    const auctionRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions`)
      .set('Cookie', sellerCookies)
      .send({
        itemId: itemRes.body[0].id,
        startingPrice: 100,
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    const closedAuctionId = auctionRes.body.id;

    // Set status to closed directly in the database
    await testDb.db
      .update(auctionsSchema.auctions)
      .set({ status: 'closed' })
      .where(eq(auctionsSchema.auctions.id, closedAuctionId));

    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${closedAuctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 200 })
      .expect(404);
  });

  it('should reject a bid on an expired auction', async () => {
    // Create a separate item + auction, then set endTime in the past
    const itemRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/items`)
      .set('Cookie', sellerCookies)
      .send({ title: 'Expired Auction Item', description: 'Will be expired' })
      .expect(201);

    const auctionRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions`)
      .set('Cookie', sellerCookies)
      .send({
        itemId: itemRes.body[0].id,
        startingPrice: 100,
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    const expiredAuctionId = auctionRes.body.id;

    // Set endTime to the past directly in the database
    await testDb.db
      .update(auctionsSchema.auctions)
      .set({ endTime: new Date(Date.now() - 60 * 1000) })
      .where(eq(auctionsSchema.auctions.id, expiredAuctionId));

    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${expiredAuctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 200 })
      .expect(404);
  });

  it('should reject a bid when the seller bids on their own auction', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', sellerCookies)
      .send({ amount: 200 })
      .expect(403);

    expect(res.body.message).toBe('You cannot bid on your own item');
  });

  it('should allow exactly one bid to succeed when 10 concurrent bids are placed at the same amount', async () => {
    // Create a fresh item + auction for the concurrency test
    const itemRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/items`)
      .set('Cookie', sellerCookies)
      .send({
        title: 'Concurrency Test Item',
        description: 'Testing locking',
      })
      .expect(201);

    const auctionRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions`)
      .set('Cookie', sellerCookies)
      .send({
        itemId: itemRes.body[0].id,
        startingPrice: 100,
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    const concurrencyAuctionId = auctionRes.body.id;

    // Register 10 distinct bidders
    const bidderCookiesList: string[][] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({
          email: `concurrent-bidder-${Date.now()}-${i}@test.com`,
          password,
          confirmPassword: password,
        })
        .expect(201);
      bidderCookiesList.push(res.headers['set-cookie'] as unknown as string[]);
    }

    // Fire 10 bids at the same amount simultaneously
    const amount = 200;
    const results = await Promise.all(
      bidderCookiesList.map((cookies) =>
        request(app.getHttpServer())
          .post(`/${PREFIX}/auctions/${concurrencyAuctionId}/bids`)
          .set('Cookie', cookies)
          .send({ amount }),
      ),
    );

    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status === 400);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(9);

    failures.forEach((r) => {
      expect(r.body.message).toBe('Bid amount is too low');
    });
  });
});
