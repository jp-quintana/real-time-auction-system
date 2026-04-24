# Load tests

k6 scripts that exercise the auction service end-to-end against the Docker Compose stack.
Three scenarios, increasing pressure, plus a seed and a post-test validator.

```
load/
  README.md          this file
  seed.js            optional: pre-create a known seller/item/auction
  01-baseline.js     50 VUs, no contention — sanity check
  02-moderate.js     100 VUs × 5 bids on the same auction — correctness under contention
  03-stress.js       0 → 1000 VUs ramp on the same auction — find the ceiling
  validate.js        Node script: post-test Postgres + Redis integrity checks
```

## Prerequisites

- Docker Compose stack up: `docker compose up -d`
- The k6 service in `docker-compose.yml` mounts `./load` → `/scripts` and sets
  `BASE_URL=http://server:3000` on the container, which all k6 scripts require.
  If you ever run k6 outside compose, export `BASE_URL` yourself.
- For `validate.js` only: Node 18+ on the host. It reuses `pg` + `ioredis` from
  `server/node_modules` so no extra `npm install` is needed. `validate.js`
  strictly requires `AUCTION_ID` plus the `DB_*` / `REDIS_CACHE_*` vars from `.env`.

## Running

All k6 scripts:

```bash
docker compose run --rm k6 run /scripts/<file>.js
```

Examples:

```bash
docker compose run --rm k6 run /scripts/seed.js
docker compose run --rm k6 run /scripts/01-baseline.js
docker compose run --rm k6 run /scripts/02-moderate.js
docker compose run --rm k6 run /scripts/03-stress.js
```

To capture results to disk (writes into `load/` on the host):

```bash
docker compose run --rm k6 run --out json=/scripts/results-stress.json /scripts/03-stress.js
```

After a contended run, validate Postgres + Redis state. Grab the `auctionId`
the script logged (look for `auctionId=…` in the k6 output), then export the
`.env` DB/Redis vars and run:

```bash
set -a; source .env; set +a
AUCTION_ID=<uuid> node load/validate.js
```

## Scenarios

### 01-baseline — sanity under parallel load (no contention)

- **50 VUs**, each on its own pre-created auction, **one bid each**
- Validates throughput and basic concurrency (connection pool, JWT verify path,
  Redis CAS, transaction commit) without any lock pressure
- **Expected:** 100% bids return 201, zero failures
- **If anything fails here:** it's a correctness or capacity bug, not a
  contention problem — fix it before moving on

### 02-moderate — contention correctness

- **100 VUs**, **5 iterations each**, all bidding on the **same auction** with
  a shared amount ladder (200 → 300 → 400 → 500 → 600)
- 500 attempts, only ~5 should win (one per amount tier); the rest get 400
  `BID_TOO_LOW` — that's the correct behavior
- **Expected:** zero 5xx, zero auth flapping, no duplicate winning bid, bid
  history strictly ascending
- **400s on bids are NOT failures** — `responseCallback` whitelists them so
  `http_req_failed` only catches real errors
- **Run `validate.js` after this to confirm correctness in the database**

### 03-stress — find the ceiling

- **Ramping VUs: 0 → 250 → 500 → 1000** over ~4 minutes, single shared auction
- Bid amounts climb ~10/sec since test start so most bids actually reach the
  Postgres lock path (not just cache-rejected)
- Thresholds (`p95<1s`, `p99<2s`) are **diagnostic, not pass/fail** — they're
  expected to fail at some VU count, and that count is your ceiling
- The relevant signal: at what VU count do `server_errors` become non-zero,
  or p99 cross your latency SLO?

While running, watch alongside:

```bash
docker stats
docker compose logs -f server | grep -iE 'error|timeout|pool'
docker compose exec db psql -U <dbuser> -d <dbname> -c "
  SELECT state, wait_event_type, wait_event, count(*)
  FROM pg_stat_activity WHERE datname='<dbname>'
  GROUP BY 1,2,3 ORDER BY 4 DESC;
"
```

Expect most sessions to be waiting on `Lock / transactionid` — proof that the
single-row `FOR UPDATE` is the bottleneck.

## Recorded results

### 03-stress — last run (1000 VUs, ~4 min, single auction)

| Metric              | Value               | Verdict                               |
| ------------------- | ------------------- | ------------------------------------- |
| Total HTTP requests | 91,283 (~381 req/s) | Sustained throughput                  |
| Bids accepted       | 2,265               | Lock correctly serialized winners     |
| Bids rejected (400) | 88,015              | Expected `BID_TOO_LOW` losers         |
| `server_errors`     | **0**               | No 5xx, no timeouts, no auth breakage |
| `http_req_failed`   | **0%**              | System stayed healthy throughout      |
| p95 latency         | 2.92 s              | ❌ over 1 s SLO                       |
| p99 latency         | 4.47 s              | ❌ over 2 s SLO                       |
| Max latency         | 4.5 s               | (queueing at the row lock)            |

**Takeaway:** The system is **correct under stress** but **slow** at 1000 VUs
hammering a single auction. Bottleneck is the `FOR UPDATE` row lock — Little's
Law confirms ~570 requests in flight at the lock manager at peak.

**Documented ceiling:** ~250–500 concurrent VUs per hot auction stay under a
1 s p95 latency budget; beyond that, latency degrades but correctness holds.

For real workloads (a single auction rarely sees >10 bids/sec), the current
design is comfortably within capacity. To push the ceiling further see the
"improving under load" notes in the project root or chat history (optimistic
concurrency, Redis-CAS-as-source-of-truth, per-auction in-process queue).

## Notes / gotchas

- Each scenario creates its own auction in `setup()`; runs are independent and
  don't share state. `seed.js` is only useful if you want a stable, named
  auction to inspect manually — scenarios will not pick it up automatically.
- VU registration takes ~50–100 ms each. Scenarios that register fresh bidders
  per VU do that in `setup()` or once per VU (cached at module scope) so the
  cost doesn't pollute bid-path latency metrics.
- Run order matters less than you think — k6 cleans up its own VUs, but the
  database accumulates users/items/auctions across runs. Wipe with
  `docker compose down -v && docker compose up -d` if you want a fresh slate.
