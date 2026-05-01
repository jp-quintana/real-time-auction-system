// Pre-seed a known seller / item / auction so you can:
//   - smoke-test the endpoints without spinning up a full scenario
//   - hand the auctionId to validate.js and inspect a known clean state
//   - reuse the seller via /auth/login if you want VUs to skip registration
//
// Run as a one-shot:
//   docker compose run --rm k6 run /scripts/seed.js
//
// Outputs the seller email and auctionId on stdout (look for "SEED >>>" lines).

import http from 'k6/http';
import { fail } from 'k6';

if (!__ENV.BASE_URL) throw new Error('Missing required env var: BASE_URL');
const BASE_URL = __ENV.BASE_URL;
const PREFIX = 'api/v1';
const PASSWORD = 'password123';

export const options = {
  vus: 1,
  iterations: 1,
};

function cookieJar(cookies) {
  const jar = {};
  for (const name in cookies) jar[name] = cookies[name][0].value;
  return jar;
}

function jsonHeaders() {
  return { headers: { 'Content-Type': 'application/json' } };
}

export default function () {
  const sellerEmail = `seed-seller-${Date.now()}@k6.test`;

  const reg = http.post(
    `${BASE_URL}/${PREFIX}/auth/register`,
    JSON.stringify({
      email: sellerEmail,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    }),
    jsonHeaders(),
  );
  if (reg.status !== 201) fail(`seller register failed: ${reg.status}`);
  const sellerCookies = cookieJar(reg.cookies);

  const item = http.post(
    `${BASE_URL}/${PREFIX}/items`,
    JSON.stringify({ title: 'seed item', description: 'k6 seed' }),
    { ...jsonHeaders(), cookies: sellerCookies },
  );
  if (item.status !== 201) fail(`item create failed: ${item.status}`);
  const itemId = item.json('0.id');

  const auction = http.post(
    `${BASE_URL}/${PREFIX}/auctions`,
    JSON.stringify({
      itemId,
      startingPrice: 100,
      endTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }),
    { ...jsonHeaders(), cookies: sellerCookies },
  );
  if (auction.status !== 201)
    fail(`auction create failed: ${auction.status}`);
  const auctionId = auction.json('id');

  console.log('SEED >>> sellerEmail=' + sellerEmail);
  console.log('SEED >>> itemId=' + itemId);
  console.log('SEED >>> auctionId=' + auctionId);
  console.log(
    'SEED >>> To validate: set -a; source .env; set +a; AUCTION_ID=' +
      auctionId +
      ' node load/validate.js',
  );
}
