// Post-test integrity checks against Postgres + Redis.
//
// This is a Node script (NOT a k6 script) — k6 has no native Postgres/Redis
// client. Run from the repo root (so it can pick up server/'s deps):
//
//   set -a; source .env; set +a
//   AUCTION_ID=<uuid> node load/validate.js
//
// The `set -a; source .env` step exports DB_* and REDIS_CACHE_* — all are
// strictly required (the script throws on missing env).
// What it asserts:
//   1. Bid amounts in created_at order are STRICTLY ascending (no equals,
//      no out-of-order). This is the real "did the row lock work?" check.
//   2. There is exactly one bidder holding the max amount (no tie at the top).
//   3. Redis cached highest bid (auction:<id>:highestBid) matches Postgres max.
//   4. (Reports only — non-fatal) total bid count and acceptance ratio.
//
// Exit code: 0 if all hard checks pass, 1 otherwise.

const { Client } = require('../server/node_modules/pg');
const Redis = require('../server/node_modules/ioredis');

function requireEnv(name) {
  const val = process.env[name];
  if (val === undefined || val === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

const AUCTION_ID = requireEnv('AUCTION_ID');

const pg = new Client({
  host: requireEnv('DB_HOST'),
  port: Number(requireEnv('DB_PORT')),
  user: requireEnv('DB_USER'),
  password: requireEnv('DB_PASSWORD'),
  database: requireEnv('DB_NAME'),
});

const redis = new Redis({
  host: requireEnv('REDIS_CACHE_HOST'),
  port: Number(requireEnv('REDIS_CACHE_PORT')),
  maxRetriesPerRequest: 2,
});

const failures = [];
const ok = (msg) => console.log('  ✓ ' + msg);
const bad = (msg) => {
  console.log('  ✗ ' + msg);
  failures.push(msg);
};

(async () => {
  await pg.connect();

  console.log(`\nValidating auction ${AUCTION_ID}\n`);

  // ─── 1. Strict-ascending bid history ────────────────────────────────────
  const { rows: bids } = await pg.query(
    `SELECT amount::float AS amount, created_at, bidder_id
     FROM bids
     WHERE auction_id = $1
     ORDER BY created_at ASC, amount ASC`,
    [AUCTION_ID],
  );

  console.log(`Total bids persisted: ${bids.length}`);

  let strictlyAscending = true;
  let firstViolation = null;
  for (let i = 1; i < bids.length; i++) {
    if (bids[i].amount <= bids[i - 1].amount) {
      strictlyAscending = false;
      firstViolation = {
        index: i,
        prev: bids[i - 1].amount,
        curr: bids[i].amount,
        at: bids[i].created_at,
      };
      break;
    }
  }
  if (strictlyAscending) {
    ok('bid amounts are strictly ascending in created_at order');
  } else {
    bad(
      `bid amounts NOT strictly ascending — at index ${firstViolation.index}: prev=${firstViolation.prev}, curr=${firstViolation.curr} (${firstViolation.at.toISOString()})`,
    );
  }

  // ─── 2. Unique top bid ──────────────────────────────────────────────────
  const { rows: topRows } = await pg.query(
    `SELECT bidder_id, amount::float AS amount
     FROM bids
     WHERE auction_id = $1
       AND amount = (SELECT max(amount) FROM bids WHERE auction_id = $1)`,
    [AUCTION_ID],
  );

  if (topRows.length === 1) {
    ok(`single winning bid: ${topRows[0].amount} by ${topRows[0].bidder_id}`);
  } else if (topRows.length === 0) {
    bad('no bids found for this auction');
  } else {
    bad(`tie at the top — ${topRows.length} bidders share max amount`);
  }

  // ─── 3. Redis cache vs DB max ───────────────────────────────────────────
  const cacheKey = `auction:${AUCTION_ID}:highestBid`;
  const cached = await redis.get(cacheKey);
  const dbMax = topRows.length > 0 ? topRows[0].amount : null;

  if (cached === null && dbMax === null) {
    ok('cache and DB both empty (no bids — consistent)');
  } else if (cached === null) {
    bad(
      `cache empty but DB has max=${dbMax} (cache eviction or never populated?)`,
    );
  } else if (Number(cached) === dbMax) {
    ok(`Redis highestBid (${cached}) matches Postgres max (${dbMax})`);
  } else {
    bad(`MISMATCH: Redis highestBid=${cached} vs Postgres max=${dbMax}`);
  }

  // ─── 4. Report-only stats ───────────────────────────────────────────────
  const { rows: auctionRow } = await pg.query(
    `SELECT status, end_time, winner_id FROM auctions WHERE id = $1`,
    [AUCTION_ID],
  );
  if (auctionRow.length === 0) {
    bad('auction row not found');
  } else {
    const a = auctionRow[0];
    console.log(
      `\nAuction status: ${a.status}, end_time: ${a.end_time.toISOString()}, winner_id: ${a.winner_id ?? '(not closed yet)'}`,
    );
  }

  // ─── Done ───────────────────────────────────────────────────────────────
  await pg.end();
  await redis.quit();

  console.log(
    failures.length === 0
      ? '\n✅ All checks passed.\n'
      : `\n❌ ${failures.length} check(s) failed.\n`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nValidation crashed:', err);
  process.exit(2);
});
