import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';
import { MailerService, MAILER_OPTIONS } from '@nestjs-modules/mailer';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  TOKEN_DATABASE_CONNECTION,
  TOKEN_CACHE_CONNECTION,
  TOKEN_NOTIFICATIONS_QUEUE,
  PREFIX,
  JOB_NOTIFICATION_OUTBID,
} from 'src/common/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';
import {
  setupTestCache,
  teardownTestCache,
  type TestCache,
} from './setup-test-cache';
import * as bidsSchema from '../src/modules/bids/schemas';

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDb;
  let testCache: TestCache;
  let notificationsQueue: Queue;
  let queueEvents: QueueEvents;

  const sendMail = jest.fn();
  const password = 'password123';
  let sellerCookies: string[];

  async function register(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({ email, password, confirmPassword: password })
      .expect(201);
    return res.headers['set-cookie'] as unknown as string[];
  }

  async function createFreshAuction(): Promise<string> {
    const itemRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/items`)
      .set('Cookie', sellerCookies)
      .send({
        title: `Notif Item ${Date.now()}-${Math.random()}`,
        description: 'notifications e2e',
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

    return auctionRes.body.id as string;
  }

  async function waitFor(
    predicate: () => boolean | Promise<boolean>,
    timeoutMs = 10_000,
    intervalMs = 50,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('waitFor: timeout');
  }

  beforeAll(async () => {
    testDb = await setupTestDb();
    testCache = await setupTestCache();
    process.env.REDIS_QUEUE_URL = testCache.connectionUri;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TOKEN_DATABASE_CONNECTION)
      .useValue(testDb.db)
      .overrideProvider(TOKEN_CACHE_CONNECTION)
      .useValue(testCache.client)
      .overrideProvider(MAILER_OPTIONS)
      .useValue({ transport: { jsonTransport: true } })
      .overrideProvider(MailerService)
      .useValue({ sendMail })
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

    notificationsQueue = moduleFixture.get<Queue>(
      getQueueToken(TOKEN_NOTIFICATIONS_QUEUE),
    );
    queueEvents = new QueueEvents(TOKEN_NOTIFICATIONS_QUEUE, {
      connection: { url: testCache.connectionUri },
    });
    await queueEvents.waitUntilReady();

    sellerCookies = await register(`seller-notif-${Date.now()}@test.com`);
  }, 60_000);

  beforeEach(() => {
    sendMail.mockReset();
  });

  afterAll(
    async () => {
      await queueEvents.close();
      await app.close();
      await teardownTestCache(testCache);
      await teardownTestDb(testDb);
    },
    11 * 60 * 1000,
  );

  it('processes an outbid job end-to-end when a bid outbids another', async () => {
    sendMail.mockResolvedValue({ messageId: 'ok' });

    const completedBefore = await notificationsQueue.getCompletedCount();

    const auctionId = await createFreshAuction();
    const bidder1Email = `b1-int-${Date.now()}@test.com`;
    const bidder2Email = `b2-int-${Date.now()}@test.com`;
    const bidder1 = await register(bidder1Email);
    const bidder2 = await register(bidder2Email);

    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidder1)
      .send({ amount: 150 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidder2)
      .send({ amount: 200 })
      .expect(201);

    await waitFor(
      async () =>
        (await notificationsQueue.getCompletedCount()) > completedBefore,
      10_000,
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mailArg = sendMail.mock.calls[0][0];
    expect(mailArg.to).toBe(bidder1Email);
    expect(mailArg.subject).toBe('You were outbid!');
  }, 30_000);

  it('retries a failing mailer call and eventually completes the job', async () => {
    sendMail
      .mockRejectedValueOnce(new Error('transient mailer failure'))
      .mockResolvedValueOnce({ messageId: 'ok-on-retry' });

    const job = await notificationsQueue.add(
      JOB_NOTIFICATION_OUTBID,
      {
        auctionId: 'retry-auction',
        previousHighBidderEmail: 'retry-prev@test.com',
        previousHighBidAmount: 100,
        newHighBidAmount: 150,
      },
      { attempts: 2, backoff: { type: 'fixed', delay: 50 } },
    );

    await job.waitUntilFinished(queueEvents, 15_000);

    expect(sendMail).toHaveBeenCalledTimes(2);

    const refreshed = await notificationsQueue.getJob(job.id!);
    expect(refreshed?.attemptsMade).toBe(2);
    expect(refreshed?.finishedOn).toBeDefined();
    expect(await refreshed!.getState()).toBe('completed');
  }, 30_000);

  it('keeps the bid persisted in Postgres and Redis when the mailer fails permanently', async () => {
    sendMail.mockRejectedValue(new Error('mailer permanently down'));

    const auctionId = await createFreshAuction();
    const bidder1 = await register(`b1-iso-${Date.now()}@test.com`);
    const bidder2 = await register(`b2-iso-${Date.now()}@test.com`);

    // First bid: no previous high bid, no notification enqueued.
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidder1)
      .send({ amount: 150 })
      .expect(201);

    // Second bid outbids the first → enqueues an outbid job that will fail in the processor.
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidder2)
      .send({ amount: 200 })
      .expect(201);

    const [row] = await testDb.db
      .select()
      .from(bidsSchema.bids)
      .where(eq(bidsSchema.bids.id, res.body.id));
    expect(row).toBeDefined();
    expect(row.amount).toBe('200.00');

    const cached = await testCache.client.get(
      `auction:${auctionId}:highestBid`,
    );
    expect(cached).not.toBeNull();
    expect(Number(cached)).toBe(200);

    await waitFor(() => sendMail.mock.calls.length >= 1, 10_000);
  }, 30_000);
});
