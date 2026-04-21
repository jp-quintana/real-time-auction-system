import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';
import { MailerService, MAILER_OPTIONS } from '@nestjs-modules/mailer';
import {
  DATABASE_CONNECTION_TOKEN,
  CACHE_CONNECTION_TOKEN,
  PREFIX,
  EVENT_BID_PLACED,
  EVENT_AUCTION_CLOSED,
} from 'src/common/constants';
import { ACCESS_TOKEN_COOKIE_NAME } from 'src/modules/auth/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';
import {
  setupTestCache,
  teardownTestCache,
  type TestCache,
} from './setup-test-cache';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  BidPlacedEvent,
  AuctionClosedEvent,
} from 'src/modules/auctions/types';
import { parse as parseCookie } from 'cookie';
import { AuctionsGateway } from 'src/modules/auctions/auctions.gateway';
import { AuthService } from 'src/modules/auth/auth.service';
import { AuctionsService } from 'src/modules/auctions/auctions.service';
import type { Socket as ServerSocket } from 'src/common/types';

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
      const timeout = setTimeout(
        () => reject(new Error('Connection timeout')),
        5000,
      );
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

  function waitForEvent<T = unknown>(
    socket: ClientSocket,
    event: string,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timeout waiting for "${event}"`)),
        timeoutMs,
      );
      socket.once(event, (data: T) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

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
  }, 60_000);

  afterEach(() => {
    for (const s of sockets) {
      if (s.connected) s.disconnect();
    }
    sockets.length = 0;
  });

  afterAll(
    async () => {
      await app.close();
      await teardownTestCache(testCache);
      await teardownTestDb(testDb);
    },
    11 * 60 * 1000,
  );

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

      const exceptionPromise = waitForEvent<{ message: string }>(
        socket,
        'exception',
      );

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

      eventEmitter.emit(EVENT_BID_PLACED, event);

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
        subscribedSocket.emit('auction:subscribe', { auctionId }, () =>
          resolve(),
        );
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

      eventEmitter.emit(EVENT_BID_PLACED, event);

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

      eventEmitter.emit(EVENT_BID_PLACED, event);

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

      eventEmitter.emit(EVENT_BID_PLACED, event);

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
        winningBid: {
          amount: 1000,
          bidderEmail: 'winner@test.com',
        },
      };

      eventEmitter.emit(EVENT_AUCTION_CLOSED, event);

      const received = await closedPromise;
      expect(received).toEqual({
        auctionId,
        winningBid: {
          amount: 1000,
          bidderEmail: 'winner@test.com',
        },
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
        winningBid: {
          amount: 999,
          bidderEmail: 'winner-no-room@test.com',
        },
      };

      eventEmitter.emit(EVENT_AUCTION_CLOSED, event);

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
      eventEmitter.emit(EVENT_BID_PLACED, {
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

      eventEmitter.emit(EVENT_BID_PLACED, {
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

  describe('full wiring: REST bid placement → socket bid:placed', () => {
    it('should deliver bid:placed over WebSocket when a bid is placed via REST', async () => {
      const socket = connectSocket(bidder2Cookies);
      await waitForConnect(socket);

      await new Promise<void>((resolve) => {
        socket.emit('auction:subscribe', { auctionId }, () => resolve());
      });

      const bidPlacedPromise = waitForEvent<{
        bidId: string;
        auctionId: string;
        amount: number;
        bidderId: string;
      }>(socket, 'bid:placed');

      await request(app.getHttpServer())
        .post(`/${PREFIX}/auctions/${auctionId}/bids`)
        .set('Cookie', bidderCookies)
        .send({ amount: 150 })
        .expect(201);

      const received = await bidPlacedPromise;

      expect(received).toMatchObject({
        auctionId,
        amount: 150,
      });
      expect(received.bidId).toBeDefined();
      expect(received.bidderId).toBeDefined();
    });
  });
});

// ── Unit tests (mocked socket, no app bootstrap) ───────────────────

describe('AuctionsGateway (unit)', () => {
  let gateway: AuctionsGateway;
  let authService: jest.Mocked<Pick<AuthService, 'verifyAccessToken'>>;
  let auctionsService: jest.Mocked<Pick<AuctionsService, 'findOneById'>>;
  let mockEmit: jest.Mock;
  let mockTo: jest.Mock;

  function createMockSocket(
    cookie?: string,
  ): ServerSocket & { join: jest.Mock; leave: jest.Mock } {
    return {
      id: 'socket-1',
      data: {},
      join: jest.fn(),
      leave: jest.fn(),
      handshake: { headers: { cookie } },
    } as any;
  }

  beforeEach(() => {
    authService = { verifyAccessToken: jest.fn() };
    auctionsService = { findOneById: jest.fn() };

    gateway = new AuctionsGateway(
      authService as unknown as AuthService,
      auctionsService as unknown as AuctionsService,
    );

    mockEmit = jest.fn();
    mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
    gateway.server = { to: mockTo } as any;
  });

  describe('handleConnection', () => {
    it('should join the user room when token is valid', async () => {
      const client = createMockSocket('access_token=valid-jwt');
      authService.verifyAccessToken.mockResolvedValue({
        userId: 'user-1',
        email: 'a@b.com',
        role: 'user',
        iat: 0,
        exp: 0,
      });

      await gateway.handleConnection(client);

      expect(authService.verifyAccessToken).toHaveBeenCalledWith('valid-jwt');
      expect(client.data.user).toEqual(
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(client.join).toHaveBeenCalledWith('user:user-1');
    });

    it('should not join any room when no cookie is present', async () => {
      const client = createMockSocket(undefined);

      await gateway.handleConnection(client);

      expect(authService.verifyAccessToken).not.toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
      expect(client.data.user).toBeUndefined();
    });

    it('should not join any room when token verification fails', async () => {
      const client = createMockSocket('access_token=bad-jwt');
      authService.verifyAccessToken.mockResolvedValue(null);

      await gateway.handleConnection(client);

      expect(authService.verifyAccessToken).toHaveBeenCalledWith('bad-jwt');
      expect(client.join).not.toHaveBeenCalled();
      expect(client.data.user).toBeUndefined();
    });
  });

  describe('handleAuctionSubscribe', () => {
    it('should join the auction room when auction exists', async () => {
      const client = createMockSocket();
      auctionsService.findOneById.mockResolvedValue({ id: 'auction-1' } as any);

      const result = await gateway.handleAuctionSubscribe(client, {
        auctionId: 'auction-1',
      });

      expect(auctionsService.findOneById).toHaveBeenCalledWith('auction-1');
      expect(client.join).toHaveBeenCalledWith('auction:auction-1');
      expect(result).toEqual({ ok: true });
    });

    it('should propagate the error when auction does not exist', async () => {
      const client = createMockSocket();
      auctionsService.findOneById.mockRejectedValue(
        new Error('Auction not found'),
      );

      await expect(
        gateway.handleAuctionSubscribe(client, { auctionId: 'bad-id' }),
      ).rejects.toThrow('Auction not found');
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleAuctionUnsubscribe', () => {
    it('should leave the auction room', async () => {
      const client = createMockSocket();

      const result = await gateway.handleAuctionUnsubscribe(client, {
        auctionId: 'auction-1',
      });

      expect(client.leave).toHaveBeenCalledWith('auction:auction-1');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('handleBidPlaced', () => {
    const baseBid = {
      id: 'bid-1',
      auctionId: 'auction-1',
      amount: 200,
      bidderId: 'bidder-1',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      deletedAt: null,
    };

    it('should emit bid:placed to the auction room', () => {
      const event: BidPlacedEvent = {
        bid: baseBid,
        auctionEndTime: new Date(),
        previousHighBidderId: null,
      };

      gateway.handleBidPlaced(event);

      expect(mockTo).toHaveBeenCalledWith('auction:auction-1');
      expect(mockEmit).toHaveBeenCalledWith(
        'bid:placed',
        expect.objectContaining({
          bidId: 'bid-1',
          auctionId: 'auction-1',
          amount: 200,
          bidderId: 'bidder-1',
        }),
      );
    });

    it('should emit bid:outbid to the previous high bidder user room', () => {
      const event: BidPlacedEvent = {
        bid: baseBid,
        auctionEndTime: new Date(),
        previousHighBidderId: 'prev-bidder',
      };

      gateway.handleBidPlaced(event);

      expect(mockTo).toHaveBeenCalledWith('auction:auction-1');
      expect(mockTo).toHaveBeenCalledWith('user:prev-bidder');
    });

    it('should NOT emit bid:outbid when same bidder places a higher bid', () => {
      const event: BidPlacedEvent = {
        bid: { ...baseBid, bidderId: 'same-bidder' },
        auctionEndTime: new Date(),
        previousHighBidderId: 'same-bidder',
      };

      gateway.handleBidPlaced(event);

      expect(mockTo).toHaveBeenCalledTimes(1);
      expect(mockTo).toHaveBeenCalledWith('auction:auction-1');
    });
  });

  describe('handleAuctionClosed', () => {
    it('should emit auction:closed to the auction room', () => {
      const event: AuctionClosedEvent = {
        auctionId: 'auction-1',
        winningBid: {
          amount: 1000,
          bidderEmail: 'winner@test.com',
        },
      };

      gateway.handleAuctionClosed(event);

      expect(mockTo).toHaveBeenCalledWith('auction:auction-1');
      expect(mockEmit).toHaveBeenCalledWith('auction:closed', {
        auctionId: 'auction-1',
        winningBid: {
          amount: 1000,
          bidderEmail: 'winner@test.com',
        },
      });
    });
  });
});
