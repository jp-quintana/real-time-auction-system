import http from 'k6/http';
import { check, fail } from 'k6';

if (!__ENV.BASE_URL) throw new Error('Missing required env var: BASE_URL');
const BASE_URL = __ENV.BASE_URL;
const PREFIX = 'api/v1';
const VUS = 50;
const PASSWORD = 'password123';

export const options = {
  scenarios: {
    baseline_sanity: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    'checks{tag:bid}': ['rate==1'],
  },
};

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@k6.test`;
}

function cookieJar(cookies) {
  const jar = {};
  for (const name in cookies) jar[name] = cookies[name][0].value;
  return jar;
}

function jsonHeaders() {
  return { headers: { 'Content-Type': 'application/json' } };
}

export function setup() {
  const auctions = [];

  for (let i = 0; i < VUS; i++) {
    const sellerEmail = unique(`seller-${i}`);

    const reg = http.post(
      `${BASE_URL}/${PREFIX}/auth/register`,
      JSON.stringify({
        email: sellerEmail,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      }),
      jsonHeaders(),
    );
    if (reg.status !== 201) fail(`seller ${i} register failed: ${reg.status}`);
    const sellerCookies = cookieJar(reg.cookies);

    const item = http.post(
      `${BASE_URL}/${PREFIX}/items`,
      JSON.stringify({
        title: `baseline item ${i}`,
        description: 'k6 baseline',
      }),
      { ...jsonHeaders(), cookies: sellerCookies },
    );
    if (item.status !== 201) fail(`item ${i} create failed: ${item.status}`);

    const auction = http.post(
      `${BASE_URL}/${PREFIX}/auctions`,
      JSON.stringify({
        itemId: item.json('0.id'),
        startingPrice: 100,
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
      { ...jsonHeaders(), cookies: sellerCookies },
    );
    if (auction.status !== 201)
      fail(`auction ${i} create failed: ${auction.status}`);

    auctions.push(auction.json('id'));
  }

  return { auctions };
}

export default function (data) {
  const auctionId = data.auctions[__VU - 1];
  const bidderEmail = unique(`bidder-${__VU}`);

  const reg = http.post(
    `${BASE_URL}/${PREFIX}/auth/register`,
    JSON.stringify({
      email: bidderEmail,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    }),
    jsonHeaders(),
  );
  check(reg, { 'bidder registered': (r) => r.status === 201 });

  const bid = http.post(
    `${BASE_URL}/${PREFIX}/auctions/${auctionId}/bids`,
    JSON.stringify({ amount: 150 }),
    { ...jsonHeaders(), cookies: cookieJar(reg.cookies) },
  );
  check(
    bid,
    { 'bid placed (201)': (r) => r.status === 201 },
    { tag: 'bid' },
  );
}
