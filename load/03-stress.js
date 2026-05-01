// Scenario 3 — stress / find-the-ceiling.
//
// This test is EXPECTED to fail thresholds. The thresholds are diagnostic
// markers (e.g., "p99 climbed above 1s") — when they fail, that's your
// breaking point. Document the VU count and approximate RPS at which:
//   - p95 / p99 latency starts climbing past your SLO
//   - http_req_failed (5xx, timeouts, connection refusals) starts rising
//   - server_errors counter becomes non-zero
//
// Watch alongside the run:
//   docker stats
//   docker compose exec db psql -U $DB_USER -d $DB_NAME -c "SELECT count(*) FROM pg_stat_activity;"
//   docker compose logs -f server | grep -iE 'error|timeout|pool'

import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter, Trend } from 'k6/metrics';

if (!__ENV.BASE_URL) throw new Error('Missing required env var: BASE_URL');
const BASE_URL = __ENV.BASE_URL;
const PREFIX = 'api/v1';
const PASSWORD = 'password123';
const STARTING_PRICE = 100;

const bidsAccepted = new Counter('bids_accepted');
const bidsRejected = new Counter('bids_rejected');
const serverErrors = new Counter('server_errors');
const bidLatency = new Trend('bid_latency_ms', true);

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 250 },   // warm-up
        { duration: '30s', target: 250 },   // hold
        { duration: '30s', target: 500 },   // ramp
        { duration: '30s', target: 500 },   // hold
        { duration: '30s', target: 1000 },  // push to ceiling
        { duration: '60s', target: 1000 },  // sustain at ceiling
        { duration: '15s', target: 0 },     // ramp down
      ],
      gracefulRampDown: '15s',
      gracefulStop: '30s',
    },
  },
  // All thresholds are diagnostic — failing them is informative, not fatal.
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    server_errors: ['count==0'],
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
  const sellerEmail = unique('seller-stress');

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
      title: 'stress item',
      description: 'k6 stress / find-ceiling',
    }),
    { ...jsonHeaders(), cookies: sellerCookies },
  );
  if (item.status !== 201) fail(`item create failed: ${item.status}`);

  const auction = http.post(
    `${BASE_URL}/${PREFIX}/auctions`,
    JSON.stringify({
      itemId: item.json('0.id'),
      startingPrice: STARTING_PRICE,
      // 4-hour window so the auction outlives any reasonable stress run
      endTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }),
    { ...jsonHeaders(), cookies: sellerCookies },
  );
  if (auction.status !== 201)
    fail(`auction create failed: ${auction.status}`);

  const auctionId = auction.json('id');
  console.log(`>>> stress auctionId=${auctionId}`);
  return { auctionId, startedAt: Date.now() };
}

// Per-VU cache — register once, reuse cookies for every bid this VU fires.
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

  // Amount climbs ~10/sec since test start so most bids plausibly beat the
  // current cached high → exercise the DB lock path, not just the cache check.
  const amount =
    STARTING_PRICE + Math.floor((Date.now() - data.startedAt) / 100);

  const bid = http.post(
    `${BASE_URL}/${PREFIX}/auctions/${data.auctionId}/bids`,
    JSON.stringify({ amount }),
    {
      ...jsonHeaders(),
      cookies: bidderCookies,
      tags: { name: 'bid' },
      // 400 (BID_TOO_LOW) is expected; don't pollute http_req_failed.
      // Anything else (5xx, 429, timeouts, connection drops) IS the signal.
      responseCallback: http.expectedStatuses(201, 400),
      timeout: '10s',
    },
  );

  bidLatency.add(bid.timings.duration);

  if (bid.status === 201) bidsAccepted.add(1);
  else if (bid.status === 400) bidsRejected.add(1);
  else serverErrors.add(1);

  // No sleep — rapid-fire. The executor + ramping VUs control the pressure.
}

// After the run:
//
//   docker compose exec db psql -U $DB_USER -d $DB_NAME -c "
//     SELECT
//       count(*) AS total_bids,
//       max(amount) AS winning_bid,
//       count(*) FILTER (WHERE amount = (SELECT max(amount) FROM bids WHERE auction_id = '<id>')) AS top_bid_count
//     FROM bids
//     WHERE auction_id = '<id>';
//   "
//
// `top_bid_count` MUST be 1 — otherwise the DB lock failed under load.
