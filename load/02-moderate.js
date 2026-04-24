import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';

if (!__ENV.BASE_URL) throw new Error('Missing required env var: BASE_URL');
const BASE_URL = __ENV.BASE_URL;
const PREFIX = 'api/v1';
const VUS = 100;
const ITERATIONS_PER_VU = 5;
const PASSWORD = 'password123';
const STARTING_PRICE = 100;
const BID_STEP = 100;

const bidsAccepted = new Counter('bids_accepted');
const bidsRejected = new Counter('bids_rejected');

export const options = {
  scenarios: {
    moderate_contention: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: ITERATIONS_PER_VU,
      maxDuration: '120s',
    },
  },
  thresholds: {
    // Only 5xx / unexpected statuses count as failures — 400s on bids are expected.
    http_req_failed: ['rate==0'],
    // Roughly: across 500 attempts, at most ~5 win (one per amount tier),
    // so the rejection rate should be high. Anything <80% means tiers aren't
    // actually contending (latency too low or bids not overlapping).
    bids_rejected: ['count>400'],
    bids_accepted: ['count>=5'],
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
  const sellerEmail = unique('seller-contention');

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
    JSON.stringify({
      title: 'contention item',
      description: 'k6 moderate contention',
    }),
    { ...jsonHeaders(), cookies: sellerCookies },
  );
  if (item.status !== 201) fail(`item create failed: ${item.status}`);

  const auction = http.post(
    `${BASE_URL}/${PREFIX}/auctions`,
    JSON.stringify({
      itemId: item.json('0.id'),
      startingPrice: STARTING_PRICE,
      endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
    { ...jsonHeaders(), cookies: sellerCookies },
  );
  if (auction.status !== 201)
    fail(`auction create failed: ${auction.status}`);

  return { auctionId: auction.json('id') };
}

// Per-VU module state — registration happens once per VU on first iteration,
// cookies reused for the remaining 4 bids.
let bidderCookies;

export default function (data) {
  if (!bidderCookies) {
    const reg = http.post(
      `${BASE_URL}/${PREFIX}/auth/register`,
      JSON.stringify({
        email: unique(`bidder-${__VU}`),
        password: PASSWORD,
        confirmPassword: PASSWORD,
      }),
      jsonHeaders(),
    );
    if (!check(reg, { 'bidder registered': (r) => r.status === 201 })) return;
    bidderCookies = cookieJar(reg.cookies);
  }

  // All VUs walk the same amount ladder so every tier is contended:
  // iter 0 → 200, iter 1 → 300, ..., iter 4 → 600
  const amount = STARTING_PRICE + (__ITER + 1) * BID_STEP;

  const bid = http.post(
    `${BASE_URL}/${PREFIX}/auctions/${data.auctionId}/bids`,
    JSON.stringify({ amount }),
    {
      ...jsonHeaders(),
      cookies: bidderCookies,
      tags: { name: 'bid' },
      // 400 (BID_TOO_LOW) is an expected rejection under contention,
      // so don't count it toward http_req_failed.
      responseCallback: http.expectedStatuses(201, 400),
    },
  );

  if (bid.status === 201) bidsAccepted.add(1);
  else if (bid.status === 400) bidsRejected.add(1);

  check(bid, {
    'bid is 201 or 400 (no 5xx, no auth errors)': (r) =>
      r.status === 201 || r.status === 400,
  });
}

// After the run, verify integrity directly in Postgres:
//
//   docker compose exec db psql -U $DB_USER -d $DB_NAME -c "
//     SELECT amount, created_at
//     FROM bids
//     WHERE auction_id = '<auctionId from k6 logs>'
//     ORDER BY created_at;
//   "
//
// Expectations:
//   - amounts are STRICTLY ascending (no equal or out-of-order rows)
//   - no duplicate amounts
//   - the final auction.winner_id (after closing) matches the highest bid's bidder
