import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';
import { MailerService, MAILER_OPTIONS } from '@nestjs-modules/mailer';
import {
  TOKEN_DATABASE_CONNECTION,
  TOKEN_CACHE_CONNECTION,
  TOKEN_AUCTION_CLOSING_QUEUE,
  PREFIX,
  AUCTION_HIGHEST_BID_KEY_SUFFIX,
  AUCTION_KEY_PREFIX,
  USER_BANNED_KEY_PREFIX,
} from 'src/common/constants';
import {
  AUCTION_STATUS_CANCELLED,
  AUCTION_STATUS_SUSPENDED,
} from 'src/modules/auctions/constants';
import { ADMIN_ROLE } from 'src/modules/users/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';
import {
  setupTestCache,
  teardownTestCache,
  type TestCache,
} from './setup-test-cache';
import { eq } from 'drizzle-orm';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import * as usersSchema from '../src/modules/users/schemas';
import * as auctionsSchema from '../src/modules/auctions/schemas';

describe('Admin (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDb;
  let testCache: TestCache;
  let queue: Queue;

  const password = 'password123';
  const adminEmail = `admin-${Date.now()}@test.com`;
  const sellerEmail = `seller-admin-${Date.now()}@test.com`;
  const bidderEmail = `bidder-admin-${Date.now()}@test.com`;

  let adminCookies: string[];
  let sellerCookies: string[];
  let bidderCookies: string[];

  async function registerUser(email: string): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/register`)
      .send({ email, password, confirmPassword: password })
      .expect(201);
    return res.headers['set-cookie'] as unknown as string[];
  }

  async function createItem(
    cookies: string[],
    title: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/items`)
      .set('Cookie', cookies)
      .send({ title, description: 'admin e2e item' })
      .expect(201);
    return res.body[0].id;
  }

  async function createAuction(
    cookies: string[],
    itemId: string,
    startingPrice = 100,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions`)
      .set('Cookie', cookies)
      .send({
        itemId,
        startingPrice,
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .expect(201);
    return res.body.id;
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

    queue = moduleFixture.get<Queue>(
      getQueueToken(TOKEN_AUCTION_CLOSING_QUEUE),
    );

    // Insert admin directly (no public registration grants admin role) and login
    const hashedPassword = await bcrypt.hash(password, 10);
    await testDb.db.insert(usersSchema.users).values({
      email: adminEmail,
      password: hashedPassword,
      role: ADMIN_ROLE,
    });

    const adminLoginRes = await request(app.getHttpServer())
      .post(`/${PREFIX}/auth/login`)
      .send({ email: adminEmail, password })
      .expect(201);
    adminCookies = adminLoginRes.headers['set-cookie'] as unknown as string[];

    sellerCookies = await registerUser(sellerEmail);
    bidderCookies = await registerUser(bidderEmail);
  }, 60_000);

  afterAll(
    async () => {
      await app.close();
      await teardownTestCache(testCache);
      await teardownTestDb(testDb);
    },
    11 * 60 * 1000,
  );

  describe('guard composition on GET /admin/auctions', () => {
    it('returns 401 when no auth cookie is sent', async () => {
      await request(app.getHttpServer())
        .get(`/${PREFIX}/admin/auctions`)
        .expect(401);
    });

    it('returns 403 when a regular (non-admin) user calls an admin endpoint', async () => {
      await request(app.getHttpServer())
        .get(`/${PREFIX}/admin/auctions`)
        .set('Cookie', sellerCookies)
        .expect(403);
    });

    it('returns 200 when an admin user calls the same endpoint', async () => {
      await request(app.getHttpServer())
        .get(`/${PREFIX}/admin/auctions`)
        .set('Cookie', adminCookies)
        .expect(200);
    });
  });

  describe('PATCH /admin/auctions/:id/freeze cascade', () => {
    it('removes the queued close job, deletes the cached highest bid, and rejects subsequent bids', async () => {
      const itemId = await createItem(sellerCookies, `Freeze Cascade ${Date.now()}`);
      const auctionId = await createAuction(sellerCookies, itemId);

      // Place a bid to populate the highest-bid cache
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auctions/${auctionId}/bids`)
        .set('Cookie', bidderCookies)
        .send({ amount: 150 })
        .expect(201);

      const cacheKey = `${AUCTION_KEY_PREFIX}:${auctionId}:${AUCTION_HIGHEST_BID_KEY_SUFFIX}`;

      // Sanity: queue job + cache key both exist before freeze
      expect(await queue.getJob(auctionId)).toBeDefined();
      expect(await testCache.client.exists(cacheKey)).toBe(1);

      await request(app.getHttpServer())
        .patch(`/${PREFIX}/admin/auctions/${auctionId}/freeze`)
        .set('Cookie', adminCookies)
        .send({})
        .expect(200);

      // Cascade: queue job removed, cache key deleted, status updated
      expect(await queue.getJob(auctionId)).toBeUndefined();
      expect(await testCache.client.exists(cacheKey)).toBe(0);

      const [row] = await testDb.db
        .select()
        .from(auctionsSchema.auctions)
        .where(eq(auctionsSchema.auctions.id, auctionId));
      expect(row.status).toBe(AUCTION_STATUS_SUSPENDED);

      // New bids on the suspended auction must be rejected (status no longer active)
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auctions/${auctionId}/bids`)
        .set('Cookie', bidderCookies)
        .send({ amount: 200 })
        .expect(404);
    });
  });

  describe('PATCH /admin/users/:id/ban enforcement', () => {
    it('blocks a banned user on authenticated endpoints, then allows them again after unban', async () => {
      const targetEmail = `ban-target-${Date.now()}@test.com`;
      const targetCookies = await registerUser(targetEmail);

      const [target] = await testDb.db
        .select()
        .from(usersSchema.users)
        .where(eq(usersSchema.users.email, targetEmail));

      // Pre-ban: target can hit an authenticated endpoint (creating an item)
      await request(app.getHttpServer())
        .post(`/${PREFIX}/items`)
        .set('Cookie', targetCookies)
        .send({ title: 'Pre-ban item', description: 'should succeed' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/${PREFIX}/admin/users/${target.id}/ban`)
        .set('Cookie', adminCookies)
        .expect(200);

      // Redis ban key must be set so AuthGuard rejects on the next request
      const banKey = `${USER_BANNED_KEY_PREFIX}:${target.id}`;
      expect(await testCache.client.exists(banKey)).toBe(1);

      // Banned user is rejected with 403 on any authenticated endpoint
      await request(app.getHttpServer())
        .post(`/${PREFIX}/items`)
        .set('Cookie', targetCookies)
        .send({ title: 'Banned attempt', description: 'should fail' })
        .expect(403);

      // Unban
      await request(app.getHttpServer())
        .patch(`/${PREFIX}/admin/users/${target.id}/unban`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(await testCache.client.exists(banKey)).toBe(0);

      // Access token JWT is stateless and remains valid; AuthGuard only re-checks
      // the Redis ban key, so the same cookie should now succeed again.
      await request(app.getHttpServer())
        .post(`/${PREFIX}/items`)
        .set('Cookie', targetCookies)
        .send({ title: 'Post-unban item', description: 'should succeed' })
        .expect(201);
    });
  });

  describe('idempotency / no-op handling', () => {
    it('returns 404 when freezing an already-cancelled auction', async () => {
      const itemId = await createItem(
        sellerCookies,
        `Idempotency Cancelled ${Date.now()}`,
      );
      const auctionId = await createAuction(sellerCookies, itemId);

      // Flip directly to cancelled so the freeze guard rejects it
      await testDb.db
        .update(auctionsSchema.auctions)
        .set({ status: AUCTION_STATUS_CANCELLED })
        .where(eq(auctionsSchema.auctions.id, auctionId));

      await request(app.getHttpServer())
        .patch(`/${PREFIX}/admin/auctions/${auctionId}/freeze`)
        .set('Cookie', adminCookies)
        .send({})
        .expect(404);

      // Status stays cancelled — no silent transition
      const [row] = await testDb.db
        .select()
        .from(auctionsSchema.auctions)
        .where(eq(auctionsSchema.auctions.id, auctionId));
      expect(row.status).toBe(AUCTION_STATUS_CANCELLED);
    });

    it('returns 404 when banning an already-banned user', async () => {
      const targetEmail = `double-ban-${Date.now()}@test.com`;
      await registerUser(targetEmail);

      const [target] = await testDb.db
        .select()
        .from(usersSchema.users)
        .where(eq(usersSchema.users.email, targetEmail));

      await request(app.getHttpServer())
        .patch(`/${PREFIX}/admin/users/${target.id}/ban`)
        .set('Cookie', adminCookies)
        .expect(200);

      const [afterFirstBan] = await testDb.db
        .select()
        .from(usersSchema.users)
        .where(eq(usersSchema.users.id, target.id));
      const firstBannedAt = afterFirstBan.bannedAt;
      expect(firstBannedAt).not.toBeNull();

      await request(app.getHttpServer())
        .patch(`/${PREFIX}/admin/users/${target.id}/ban`)
        .set('Cookie', adminCookies)
        .expect(404);

      // bannedAt timestamp must not have moved on the duplicate call
      const [afterSecondBan] = await testDb.db
        .select()
        .from(usersSchema.users)
        .where(eq(usersSchema.users.id, target.id));
      expect(afterSecondBan.bannedAt?.getTime()).toBe(firstBannedAt!.getTime());
    });
  });
});
