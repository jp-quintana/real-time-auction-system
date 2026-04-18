import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import {
  DATABASE_CONNECTION,
  CACHE_CONNECTION,
  AUCTION_CLOSING_QUEUE,
  AUCTION_STATUS_CANCELLED,
  AUCTION_STATUS_CLOSED,
} from 'src/common/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';
import {
  setupTestCache,
  teardownTestCache,
  type TestCache,
} from './setup-test-cache';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import * as usersSchema from '../src/modules/users/schemas';
import * as itemsSchema from '../src/modules/items/schemas';
import * as auctionsSchema from '../src/modules/auctions/schemas';
import * as bidsSchema from '../src/modules/bids/schemas';
import { AuctionsService } from '../src/modules/auctions/auctions.service';
import { BidsService } from '../src/modules/bids/bids.service';
import { AuctionClosingProcessor } from '../src/modules/auction-closing/auction-closing.processor';

type AuctionClosedPayload = {
  auctionId: string;
  winningBid: { amount: number; bidderEmail: string } | null;
};

describe('Auction Closing (e2e)', () => {
  let app: INestApplication;
  let testDb: TestDb;
  let testCache: TestCache;
  let eventEmitter: EventEmitter2;
  let queue: Queue;
  let auctionsService: AuctionsService;
  let bidsService: BidsService;
  let closingProcessor: AuctionClosingProcessor;

  async function insertUser(email: string): Promise<string> {
    const [row] = await testDb.db
      .insert(usersSchema.users)
      .values({ email, password: 'hash' })
      .returning();
    return row.id;
  }

  async function insertItem(sellerId: string, title: string): Promise<string> {
    const [row] = await testDb.db
      .insert(itemsSchema.items)
      .values({ sellerId, title, description: 'auction-closing e2e' })
      .returning();
    return row.id;
  }

  function waitForClosedEvent(
    auctionId: string,
    timeoutMs: number,
  ): Promise<AuctionClosedPayload> {
    return new Promise((resolve, reject) => {
      const listener = (e: AuctionClosedPayload) => {
        if (e.auctionId !== auctionId) return;
        clearTimeout(timer);
        eventEmitter.off('auction.closed', listener);
        resolve(e);
      };
      const timer = setTimeout(() => {
        eventEmitter.off('auction.closed', listener);
        reject(new Error(`Timed out waiting for auction.closed for ${auctionId}`));
      }, timeoutMs);
      eventEmitter.on('auction.closed', listener);
    });
  }

  function collectClosedEvents(auctionId: string): {
    events: AuctionClosedPayload[];
    stop: () => void;
  } {
    const events: AuctionClosedPayload[] = [];
    const listener = (e: AuctionClosedPayload) => {
      if (e.auctionId === auctionId) events.push(e);
    };
    eventEmitter.on('auction.closed', listener);
    return {
      events,
      stop: () => eventEmitter.off('auction.closed', listener),
    };
  }

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
    await app.init();

    eventEmitter = moduleFixture.get(EventEmitter2);
    queue = moduleFixture.get<Queue>(getQueueToken(AUCTION_CLOSING_QUEUE));
    auctionsService = moduleFixture.get(AuctionsService);
    bidsService = moduleFixture.get(BidsService);
    closingProcessor = moduleFixture.get(AuctionClosingProcessor);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await teardownTestCache(testCache);
    await teardownTestDb(testDb);
  }, 60_000);

  it('closes an active auction and emits the winning bid after endTime elapses', async () => {
    const sellerId = await insertUser(`seller-happy-${Date.now()}@test.com`);
    const bidderEmail = `bidder-happy-${Date.now()}@test.com`;
    const bidderId = await insertUser(bidderEmail);
    const itemId = await insertItem(sellerId, `Happy Path Item ${Date.now()}`);

    // Bypass the DTO's 60s minimum by calling the service directly
    const auction = await auctionsService.create(sellerId, {
      itemId,
      startingPrice: 100,
      endTime: new Date(Date.now() + 2000),
    });

    const closedPromise = waitForClosedEvent(auction.id, 8000);

    await bidsService.placeBid(auction.id, bidderId, { amount: 250 });

    const event = await closedPromise;

    expect(event).toEqual({
      auctionId: auction.id,
      winningBid: { amount: 250, bidderEmail },
    });

    const [row] = await testDb.db
      .select()
      .from(auctionsSchema.auctions)
      .where(eq(auctionsSchema.auctions.id, auction.id));
    expect(row.status).toBe(AUCTION_STATUS_CLOSED);
    expect(row.winnerId).toBe(bidderId);
  }, 20_000);

  it('is idempotent when the processor runs twice for the same auction', async () => {
    const sellerId = await insertUser(`seller-idem-${Date.now()}@test.com`);
    const bidderEmail = `bidder-idem-${Date.now()}@test.com`;
    const bidderId = await insertUser(bidderEmail);
    const itemId = await insertItem(sellerId, `Idempotency Item ${Date.now()}`);

    // Insert an already-expired active auction directly — no queue job involved
    const [auction] = await testDb.db
      .insert(auctionsSchema.auctions)
      .values({
        itemId,
        startingPrice: '100.00',
        endTime: new Date(Date.now() - 5000),
      })
      .returning();

    await testDb.db.insert(bidsSchema.bids).values({
      auctionId: auction.id,
      bidderId,
      amount: '175.00',
    });

    const collected = collectClosedEvents(auction.id);

    const job = {
      name: 'close',
      data: { auctionId: auction.id },
    } as unknown as Job<{ auctionId: string }, void, 'close'>;

    await closingProcessor.process(job);
    await closingProcessor.process(job);

    collected.stop();

    expect(collected.events).toHaveLength(1);
    expect(collected.events[0]).toEqual({
      auctionId: auction.id,
      winningBid: { amount: 175, bidderEmail },
    });

    const [row] = await testDb.db
      .select()
      .from(auctionsSchema.auctions)
      .where(eq(auctionsSchema.auctions.id, auction.id));
    expect(row.status).toBe(AUCTION_STATUS_CLOSED);
    expect(row.winnerId).toBe(bidderId);
  });

  it('closes an auction with no bids and emits null winningBid', async () => {
    const sellerId = await insertUser(`seller-nobid-${Date.now()}@test.com`);
    const itemId = await insertItem(sellerId, `No Bid Item ${Date.now()}`);

    const auction = await auctionsService.create(sellerId, {
      itemId,
      startingPrice: 100,
      endTime: new Date(Date.now() + 2000),
    });

    const event = await waitForClosedEvent(auction.id, 8000);

    expect(event).toEqual({
      auctionId: auction.id,
      winningBid: null,
    });

    const [row] = await testDb.db
      .select()
      .from(auctionsSchema.auctions)
      .where(eq(auctionsSchema.auctions.id, auction.id));
    expect(row.status).toBe(AUCTION_STATUS_CLOSED);
    expect(row.winnerId).toBeNull();
  }, 20_000);

  it('no-ops when the auction was cancelled before the job fires', async () => {
    const sellerId = await insertUser(`seller-cancel-${Date.now()}@test.com`);
    const itemId = await insertItem(sellerId, `Cancelled Item ${Date.now()}`);

    const auction = await auctionsService.create(sellerId, {
      itemId,
      startingPrice: 100,
      endTime: new Date(Date.now() + 2000),
    });

    // Manually flip status to cancelled before the delayed job fires
    await testDb.db
      .update(auctionsSchema.auctions)
      .set({ status: AUCTION_STATUS_CANCELLED })
      .where(eq(auctionsSchema.auctions.id, auction.id));

    const collected = collectClosedEvents(auction.id);

    // Wait past endTime so the worker picks up and processes the job
    await new Promise((r) => setTimeout(r, 3500));

    collected.stop();

    expect(collected.events).toHaveLength(0);

    const [row] = await testDb.db
      .select()
      .from(auctionsSchema.auctions)
      .where(eq(auctionsSchema.auctions.id, auction.id));
    expect(row.status).toBe(AUCTION_STATUS_CANCELLED);
  }, 20_000);

  it('removes the queued job and enqueues a new one when endTime is updated', async () => {
    const sellerId = await insertUser(`seller-resched-${Date.now()}@test.com`);
    const itemId = await insertItem(sellerId, `Reschedule Item ${Date.now()}`);

    const auction = await auctionsService.create(sellerId, {
      itemId,
      startingPrice: 100,
      endTime: new Date(Date.now() + 10 * 60 * 1000),
    });

    const originalJob = await queue.getJob(auction.id);
    expect(originalJob).toBeDefined();
    const originalTimestamp = originalJob!.timestamp;
    const originalDelay = originalJob!.opts.delay ?? 0;
    const originalFireAt = originalTimestamp + originalDelay;

    const newEnd = new Date(Date.now() + 30 * 60 * 1000);
    const updated = await auctionsService.update(auction.id, sellerId, {
      endTime: newEnd,
    });

    const newJob = await queue.getJob(auction.id);

    expect(newJob).toBeDefined();
    expect(newJob!.id).toBe(auction.id);
    expect(newJob!.timestamp).toBeGreaterThan(originalTimestamp);

    const newFireAt = newJob!.timestamp + (newJob!.opts.delay ?? 0);
    expect(Math.abs(newFireAt - updated.endTime.getTime())).toBeLessThan(1000);
    expect(Math.abs(newFireAt - originalFireAt)).toBeGreaterThan(5 * 60 * 1000);

    // Clean up so the long-delayed job doesn't linger in Redis
    await newJob!.remove();
  }, 20_000);
});
