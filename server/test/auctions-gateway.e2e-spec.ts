import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';
import {
  DATABASE_CONNECTION,
  CACHE_CONNECTION,
  PREFIX,
  ACCESS_TOKEN_COOKIE_NAME,
} from 'src/common/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';
import {
  setupTestCache,
  teardownTestCache,
  type TestCache,
} from './setup-test-cache';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { BidPlacedEvent, AuctionClosedEvent } from 'src/modules/auctions/types';
import { parse as parseCookie } from 'cookie';

function extractUserId(cookies: string[]): string {
  for (const c of cookies) {
    const parsed = parseCookie(c);
    const token = parsed[ACCESS_TOKEN_COOKIE_NAME];
    if (token) {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      );
      return payload.userId;
    }
  }
  throw new Error('No access_token cookie found');
}

describe('AuctionsGateway (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDb;
  let testCache: TestCache;
  let eventEmitter: EventEmitter2;

  let baseUrl: string;

  let sellerCookies: string[];
  let bidderCookies: string[];
  let bidder2Cookies: string[];
  let auctionId: string;

  const password = 'password123';

  const sockets: ClientSocket[] = [];

  function connectSocket(cookies: string[]): ClientSocket {
    const socket = io(`${baseUrl}/auctions`, {
      transports: ['websocket'],
      extraHeaders: {
        cookie: cookies.join('; '),
      },
    });
    sockets.push(socket);
    return socket;
  }

  function waitForConnect(socket: ClientSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  function waitForEvent<T = unknown>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
      socket.once(event, (data: T) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

  beforeAll(async () => {
    testDb = await setupTestDb();
    testCache = await setupTestCache();

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
    await app.listen(0);

    const url = await app.getUrl();
    baseUrl = url.replace('[::1]', 'localhost');

    eventEmitter = moduleFixture.get(EventEmitter2);

    // Register seller
    const sellerRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({
        email: `seller-ws-${Date.now()}@test.com`,
        password,
        confirmPassword: password,
      })
      .expect(201);
    sellerCookies = sellerRes.headers['set-cookie'] as unknown as string[];

    // Register bidder
    const bidderRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({
        email: `bidder-ws-${Date.now()}@test.com`,
        password,
        confirmPassword: password,
      })
      .expect(201);
    bidderCookies = bidderRes.headers['set-cookie'] as unknown as string[];

    // Register bidder2
    const bidder2Res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({
        email: `bidder2-ws-${Date.now()}@test.com`,
        password,
        confirmPassword: password,
      })
      .expect(201);
    bidder2Cookies = bidder2Res.headers['set-cookie'] as unknown as string[];

    // Create item + auction
    const itemRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/items`)
      .set('Cookie', sellerCookies)
      .send({ title: 'WS Test Item', description: 'Gateway e2e test item' })
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
    auctionId = auctionRes.body.id;
  });

  afterEach(() => {
    for (const s of sockets) {
      if (s.connected) s.disconnect();
    }
    sockets.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await teardownTestCache(testCache);
    await teardownTestDb(testDb);
  }, 11 * 60 * 1000);

  describe('handleConnection', () => {
    it('should authenticate a client with valid cookies', async () => {
      const socket = connectSocket(bidderCookies);
      await waitForConnect(socket);
      expect(socket.connected).toBe(true);
    });

    it('should still connect a client with no cookies (unauthenticated)', async () => {
      const socket = connectSocket([]);
      await waitForConnect(socket);
      expect(socket.connected).toBe(true);
    });
  });

  describe('auction:subscribe / auction:unsubscribe', () => {
    it('should subscribe to an auction room and return { ok: true }', async () => {
      const socket = connectSocket(bidderCookies);
      await waitForConnect(socket);

      const response = await new Promise<any>((resolve) => {
        socket.emit('auction:subscribe', { auctionId }, (ack: any) => {
          resolve(ack);
        });
      });

      expect(response).toEqual({ ok: true });
    });

    it('should unsubscribe from an auction room and return { ok: true }', async () => {
      const socket = connectSocket(bidderCookies);
      await waitForConnect(socket);

      // Subscribe first
      await new Promise<void>((resolve) => {
        socket.emit('auction:subscribe', { auctionId }, () => resolve());
      });

      const response = await new Promise<any>((resolve) => {
        socket.emit('auction:unsubscribe', { auctionId }, (ack: any) => {
          resolve(ack);
        });
      });

      expect(response).toEqual({ ok: true });
    });

    it('should emit an exception when subscribing with a non-existent auctionId', async () => {
      const socket = connectSocket(bidderCookies);
      await waitForConnect(socket);

      const exceptionPromise = waitForEvent<{ message: string }>(socket, 'exception');

      socket.emit('auction:subscribe', {
        auctionId: '00000000-0000-0000-0000-000000000000',
      });

      const error = await exceptionPromise;
      expect(error).toHaveProperty('message');
    });
  });

  describe('bid.placed event', () => {
    it('should broadcast bid:placed to clients subscribed to the auction room', async () => {
      const socket = connectSocket(bidderCookies);
      await waitForConnect(socket);

      await new Promise<void>((resolve) => {
        socket.emit('auction:subscribe', { auctionId }, () => resolve());
      });

      const bidPlacedPromise = waitForEvent(socket, 'bid:placed');

      const event: BidPlacedEvent = {
        bid: {
          id: 'bid-123',
          auctionId,
          amount: 200,
          bidderId: 'bidder-456',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        auctionEndTime: new Date(Date.now() + 60 * 60 * 1000),
        previousHighBidderId: null,
      };

      eventEmitter.emit('bid.placed', event);

      const received = await bidPlacedPromise;
      expect(received).toMatchObject({
        bidId: 'bid-123',
        auctionId,
        amount: 200,
        bidderId: 'bidder-456',
      });
    });

    it('should NOT send bid:placed to clients not subscribed to the auction', async () => {
      const subscribedSocket = connectSocket(bidderCookies);
      const unsubscribedSocket = connectSocket(bidder2Cookies);
      await Promise.all([
        waitForConnect(subscribedSocket),
        waitForConnect(unsubscribedSocket),
      ]);

      // Only subscribe the first socket
      await new Promise<void>((resolve) => {
        subscribedSocket.emit('auction:subscribe', { auctionId }, () => resolve());
      });

      const subscribedPromise = waitForEvent(subscribedSocket, 'bid:placed');

      let unsubscribedReceived = false;
      unsubscribedSocket.on('bid:placed', () => {
        unsubscribedReceived = true;
      });

      const event: BidPlacedEvent = {
        bid: {
          id: 'bid-not-sub',
          auctionId,
          amount: 300,
          bidderId: 'someone',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        auctionEndTime: new Date(Date.now() + 60 * 60 * 1000),
        previousHighBidderId: null,
      };

      eventEmitter.emit('bid.placed', event);

      await subscribedPromise;

      // Give a small window for the unsubscribed socket to potentially receive
      await new Promise((r) => setTimeout(r, 200));
      expect(unsubscribedReceived).toBe(false);
    });

    it('should send bid:outbid to the previous high bidder', async () => {
      const prevBidderId = extractUserId(bidderCookies);

      const prevBidderSocket = connectSocket(bidderCookies);
      await waitForConnect(prevBidderSocket);

      const outbidPromise = waitForEvent(prevBidderSocket, 'bid:outbid');

      const event: BidPlacedEvent = {
        bid: {
          id: 'bid-outbid-test',
          auctionId,
          amount: 500,
          bidderId: 'new-bidder-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        auctionEndTime: new Date(Date.now() + 60 * 60 * 1000),
        previousHighBidderId: prevBidderId,
      };

      eventEmitter.emit('bid.placed', event);

      const received = await outbidPromise;
      expect(received).toMatchObject({
        auctionId,
        newAmount: 500,
      });
    });

    it('should NOT send bid:outbid when the same bidder places a higher bid', async () => {
      const sameBidderId = extractUserId(bidder2Cookies);

      const bidderSocket = connectSocket(bidder2Cookies);
      await waitForConnect(bidderSocket);

      let outbidReceived = false;
      bidderSocket.on('bid:outbid', () => {
        outbidReceived = true;
      });

      const event: BidPlacedEvent = {
        bid: {
          id: 'bid-same-bidder',
          auctionId,
          amount: 600,
          bidderId: sameBidderId,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        auctionEndTime: new Date(Date.now() + 60 * 60 * 1000),
        previousHighBidderId: sameBidderId,
      };

      eventEmitter.emit('bid.placed', event);

      await new Promise((r) => setTimeout(r, 500));
      expect(outbidReceived).toBe(false);
    });
  });

  describe('auction.closed event', () => {
    it('should broadcast auction:closed to clients subscribed to the auction room', async () => {
      const socket = connectSocket(bidderCookies);
      await waitForConnect(socket);

      await new Promise<void>((resolve) => {
        socket.emit('auction:subscribe', { auctionId }, () => resolve());
      });

      const closedPromise = waitForEvent(socket, 'auction:closed');

      const event: AuctionClosedEvent = {
        auctionId,
        winningBidAmount: 1000,
        winningBidderId: 'winner-123',
      };

      eventEmitter.emit('auction.closed', event);

      const received = await closedPromise;
      expect(received).toEqual({
        winningBidAmount: 1000,
        winningBidderId: 'winner-123',
      });
    });

    it('should NOT send auction:closed to clients not in the auction room', async () => {
      const socket = connectSocket(bidderCookies);
      await waitForConnect(socket);
      // Do NOT subscribe to any auction room

      let closedReceived = false;
      socket.on('auction:closed', () => {
        closedReceived = true;
      });

      const event: AuctionClosedEvent = {
        auctionId,
        winningBidAmount: 999,
        winningBidderId: 'winner-456',
      };

      eventEmitter.emit('auction.closed', event);

      await new Promise((r) => setTimeout(r, 500));
      expect(closedReceived).toBe(false);
    });
  });

  describe('unsubscribe stops receiving events', () => {
    it('should stop receiving bid:placed after unsubscribing', async () => {
      const socket = connectSocket(bidderCookies);
      await waitForConnect(socket);

      // Subscribe
      await new Promise<void>((resolve) => {
        socket.emit('auction:subscribe', { auctionId }, () => resolve());
      });

      // Verify we receive events
      const firstBidPromise = waitForEvent(socket, 'bid:placed');
      eventEmitter.emit('bid.placed', {
        bid: {
          id: 'bid-before-unsub',
          auctionId,
          amount: 700,
          bidderId: 'someone',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        auctionEndTime: new Date(Date.now() + 60 * 60 * 1000),
        previousHighBidderId: null,
      } satisfies BidPlacedEvent);
      await firstBidPromise;

      // Unsubscribe
      await new Promise<void>((resolve) => {
        socket.emit('auction:unsubscribe', { auctionId }, () => resolve());
      });

      // Should NOT receive events after unsubscribing
      let receivedAfterUnsub = false;
      socket.on('bid:placed', () => {
        receivedAfterUnsub = true;
      });

      eventEmitter.emit('bid.placed', {
        bid: {
          id: 'bid-after-unsub',
          auctionId,
          amount: 800,
          bidderId: 'someone',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        auctionEndTime: new Date(Date.now() + 60 * 60 * 1000),
        previousHighBidderId: null,
      } satisfies BidPlacedEvent);

      await new Promise((r) => setTimeout(r, 500));
      expect(receivedAfterUnsub).toBe(false);
    });
  });
});
