import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';
import { DATABASE_CONNECTION, PREFIX } from 'src/common/constants';
import { setupTestDb, teardownTestDb, type TestDb } from './setup-test-db';

describe('POST /auctions/:auctionId/bids (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDb;

  let sellerCookies: string[];
  let bidderCookies: string[];
  let auctionId: string;
  const startingPrice = 100;

  const sellerEmail = `seller-bids-${Date.now()}@test.com`;
  const bidderEmail = `bidder-bids-${Date.now()}@test.com`;
  const password = 'password123';

  beforeAll(async () => {
    testDb = await setupTestDb();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue(testDb.db)
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

  afterAll(async () => {
    await app.close();
    await teardownTestDb(testDb);
  });

  it('should return 401 when no auth token is provided', async () => {
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .send({ amount: 150 })
      .expect(401);
  });

  it('should return 400 when amount is missing', async () => {
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({})
      .expect(400);
  });

  it('should return 400 when amount is below minimum', async () => {
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 0 })
      .expect(400);
  });

  it('should return 400 when amount has more than 2 decimal places', async () => {
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 150.123 })
      .expect(400);
  });

  it('should return 400 when amount exceeds maximum', async () => {
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 1_000_001 })
      .expect(400);
  });

  it('should return 400 when extra fields are sent', async () => {
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 150, extraField: 'not allowed' })
      .expect(400);
  });

  it('should return 404 when auction does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${fakeId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 150 })
      .expect(404);
  });

  it('should return 403 when seller bids on their own auction', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', sellerCookies)
      .send({ amount: 150 })
      .expect(403);

    expect(res.body.message).toBe('You cannot bid on your own item');
  });

  it('should return 400 when bid amount equals starting price', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: startingPrice })
      .expect(400);

    expect(res.body.message).toBe('Bid amount is too low');
  });

  it('should return 400 when bid amount is below starting price', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 50 })
      .expect(400);

    expect(res.body.message).toBe('Bid amount is too low');
  });

  it('should place a bid successfully', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 150 })
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      auctionId,
      amount: '150.00',
    });
  });

  it('should return 400 when bid is equal to current highest bid', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 150 })
      .expect(400);

    expect(res.body.message).toBe('Bid amount is too low');
  });

  it('should return 400 when bid is below current highest bid', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 120 })
      .expect(400);

    expect(res.body.message).toBe('Bid amount is too low');
  });

  it('should place a second higher bid successfully', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${PREFIX}/auctions/${auctionId}/bids`)
      .set('Cookie', bidderCookies)
      .send({ amount: 200.5 })
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      auctionId,
      amount: '200.50',
    });
  });
});
