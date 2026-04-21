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
  PREFIX,
} from 'src/common/constants';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from 'src/modules/auth/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';
import {
  setupTestCache,
  teardownTestCache,
  type TestCache,
} from './setup-test-cache';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDb;
  let testCache: TestCache;

  const password = 'password123';

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
  }, 60_000);

  afterAll(
    async () => {
      await app.close();
      await teardownTestCache(testCache);
      await teardownTestDb(testDb);
    },
    11 * 60 * 1000,
  );

  function extractCookieValue(
    cookies: string[],
    name: string,
  ): string | undefined {
    for (const c of cookies) {
      const match = c.match(new RegExp(`${name}=([^;]+)`));
      if (match) return match[1];
    }
    return undefined;
  }

  // ── Register ──────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('should register a new user and set auth cookies', async () => {
      const res = await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({
          email: `register-${Date.now()}@test.com`,
          password,
          confirmPassword: password,
        })
        .expect(201);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(
        extractCookieValue(cookies, ACCESS_TOKEN_COOKIE_NAME),
      ).toBeDefined();
      expect(
        extractCookieValue(cookies, REFRESH_TOKEN_COOKIE_NAME),
      ).toBeDefined();
      expect(res.body).toEqual({ message: 'Success!' });
    });

    it('should return 409 when registering with a duplicate email', async () => {
      const email = `dup-${Date.now()}@test.com`;

      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({ email, password, confirmPassword: password })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({ email, password, confirmPassword: password })
        .expect(409);
    });

    it('should return 400 when password is too short', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({
          email: `short-pw-${Date.now()}@test.com`,
          password: 'short',
          confirmPassword: 'short',
        })
        .expect(400);
    });

    it('should return 400 when passwords do not match', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({
          email: `mismatch-${Date.now()}@test.com`,
          password,
          confirmPassword: 'different123',
        })
        .expect(400);
    });

    it('should return 400 when email is invalid', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({
          email: 'not-an-email',
          password,
          confirmPassword: password,
        })
        .expect(400);
    });

    it('should return 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({})
        .expect(400);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    const email = `login-${Date.now()}@test.com`;

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({ email, password, confirmPassword: password })
        .expect(201);
    });

    it('should login with valid credentials and set auth cookies', async () => {
      const res = await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/login`)
        .send({ email, password })
        .expect(201);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(
        extractCookieValue(cookies, ACCESS_TOKEN_COOKIE_NAME),
      ).toBeDefined();
      expect(
        extractCookieValue(cookies, REFRESH_TOKEN_COOKIE_NAME),
      ).toBeDefined();
      expect(res.body).toEqual({ message: 'Success!' });
    });

    it('should return 404 for a non-existent email', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/login`)
        .send({ email: 'nobody@test.com', password })
        .expect(404);
    });

    it('should return 401 for an incorrect password', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/login`)
        .send({ email, password: 'wrongpassword' })
        .expect(401);
    });

    it('should return 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/login`)
        .send({ password })
        .expect(400);
    });
  });

  // ── Refresh ───────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    let cookies: string[];

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({
          email: `refresh-${Date.now()}@test.com`,
          password,
          confirmPassword: password,
        })
        .expect(201);

      cookies = res.headers['set-cookie'] as unknown as string[];
    });

    it('should refresh tokens and set new auth cookies', async () => {
      const res = await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/refresh`)
        .set('Cookie', cookies)
        .expect(201);

      const newCookies = res.headers['set-cookie'] as unknown as string[];
      expect(
        extractCookieValue(newCookies, ACCESS_TOKEN_COOKIE_NAME),
      ).toBeDefined();
      expect(
        extractCookieValue(newCookies, REFRESH_TOKEN_COOKIE_NAME),
      ).toBeDefined();
      expect(res.body).toEqual({ message: 'Success!' });
    });

    it('should return 401 when no refresh token cookie is provided', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/refresh`)
        .expect(401);
    });

    it('should return 401 when refresh token cookie is invalid', async () => {
      await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/refresh`)
        .set('Cookie', [`${REFRESH_TOKEN_COOKIE_NAME}=invalid.token.value`])
        .expect(401);
    });
  });

  // ── Full flow ─────────────────────────────────────────────────────

  describe('register → login → refresh → access protected route', () => {
    it('should complete the full auth lifecycle', async () => {
      const email = `flow-${Date.now()}@test.com`;

      // 1. Register
      const registerRes = await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/register`)
        .send({ email, password, confirmPassword: password })
        .expect(201);

      const registerCookies = registerRes.headers[
        'set-cookie'
      ] as unknown as string[];
      expect(
        extractCookieValue(registerCookies, ACCESS_TOKEN_COOKIE_NAME),
      ).toBeDefined();

      // 2. Login
      const loginRes = await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/login`)
        .send({ email, password })
        .expect(201);

      const loginCookies = loginRes.headers[
        'set-cookie'
      ] as unknown as string[];

      // 3. Refresh
      const refreshRes = await request(app.getHttpServer())
        .post(`/${PREFIX}/auth/refresh`)
        .set('Cookie', loginCookies)
        .expect(201);

      const refreshCookies = refreshRes.headers[
        'set-cookie'
      ] as unknown as string[];
      const newAccessToken = extractCookieValue(
        refreshCookies,
        ACCESS_TOKEN_COOKIE_NAME,
      );
      expect(newAccessToken).toBeDefined();

      // 4. Access a protected route with refreshed tokens
      await request(app.getHttpServer())
        .post(`/${PREFIX}/items`)
        .set('Cookie', refreshCookies)
        .send({
          title: 'Auth flow test item',
          description: 'Testing auth lifecycle',
        })
        .expect(201);
    });
  });
});
