# Real-Time Auction System

A distributed auction backend built with NestJS, PostgreSQL, Redis, BullMQ,
Socket.IO, and Docker Compose. The project models the core workflow for an
online auction platform: users list items, sellers open auctions, bidders place
concurrent bids, admins moderate activity, and clients receive live auction
events over WebSockets.

## What is included

- REST API with cookie-based authentication and role-based admin endpoints.
- Real-time auction updates through a Socket.IO gateway.
- PostgreSQL persistence managed with Drizzle ORM migrations.
- Redis cache for hot bid/user state and Redis-backed Socket.IO fan-out.
- BullMQ queues for scheduled auction closing and email notifications.
- Nginx load-balancer service for exercising multiple server replicas.
- k6 load-test scripts and a post-run validator.
- Jest e2e coverage using Testcontainers for PostgreSQL and Redis.

## Tech stack

| Layer | Tools |
| --- | --- |
| API | NestJS 11, TypeScript, Swagger |
| Database | PostgreSQL 16, Drizzle ORM, drizzle-kit |
| Cache / realtime fan-out | Redis 7.4, ioredis, Socket.IO Redis adapter |
| Jobs | BullMQ |
| Mail | `@nestjs-modules/mailer`, Nodemailer test accounts in development |
| Load testing | k6 |
| Runtime | Docker Compose, Node 20 |

## Project layout

```text
.
+-- docker-compose.yml      # App stack: API, Postgres, Redis, Nginx, k6
+-- nginx.conf              # Proxy for internal server replicas
+-- load/                   # k6 scenarios, seed script, validator
`-- server/                 # NestJS application
    +-- drizzle/            # Generated database migrations
    +-- docs/               # WebSocket gateway notes
    +-- src/                # API modules, queues, adapters, schemas
    `-- test/               # Jest e2e tests
```

## Quick start

Create the Compose and server environment files:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

Fill `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` in `server/.env`. A good
local value can be generated with:

```bash
openssl rand -hex 64
```

Start the stack:

```bash
docker compose up --build
```

Or run it in the background:

```bash
docker compose up -d --build
docker compose logs -f server
```

The server runs database migrations on startup through `npm run start:dev`.

## Local URLs

| Service | URL |
| --- | --- |
| API direct to main server | `http://localhost:3000/api/v1` |
| Swagger docs | `http://localhost:3000/api/v1/docs` |
| Nginx load-balanced API | `http://localhost:8080/api/v1` |
| RedisInsight | `http://localhost:5541` by default |
| PostgreSQL on host | `localhost:5433` by default |
| Redis cache on host | `localhost:6380` by default |
| Redis queue on host | `localhost:6381` by default |

The API adds an `X-Instance-ID` response header, which is useful when checking
which container handled a request through the Nginx endpoint.

## Environment files

There are two environment files on purpose:

- `.env` is read by Docker Compose for service interpolation such as database
  credentials and host ports.
- `server/.env` is read by NestJS for runtime settings such as token secrets,
  token TTLs, cookie max ages, and `NODE_ENV`.

In Docker Compose, `DATABASE_URL`, `REDIS_CACHE_URL`, and `REDIS_QUEUE_URL` are
overridden to point at the Compose service names. If you run the server directly
from `server/`, set those values yourself in `server/.env`.

## API overview

All REST routes are prefixed with `/api/v1`.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` |
| Users | `GET /users`, `GET /users/me`, `GET /users/me/items` |
| Items | `GET /items`, `GET /items/:id`, `POST /items`, `PATCH /items/:id` |
| Auctions | `GET /auctions`, `GET /auctions/:id`, `POST /auctions`, `PATCH /auctions/:id`, `DELETE /auctions/:id` |
| Bids | `POST /auctions/:auctionId/bids` |
| Admin | `PATCH /admin/auctions/:id/freeze`, `PATCH /admin/auctions/:id/unfreeze`, `PATCH /admin/auctions/:id/cancel`, `PATCH /admin/users/:id/ban`, `PATCH /admin/users/:id/unban`, `GET /admin/auctions`, `GET /admin/auctions/suspicious` |

Authentication is cookie-based. Successful register/login responses set
HTTP-only access and refresh token cookies. Admin-only routes require a user
with role `admin`.

## WebSockets

The Socket.IO gateway uses the `/auctions` namespace and shares events across
server replicas with the Redis adapter.

Client-to-server messages:

- `auction:subscribe` with `{ "auctionId": "<uuid>" }`
- `auction:unsubscribe` with `{ "auctionId": "<uuid>" }`

Server-to-client events:

- `bid:placed` for auction room updates.
- `bid:outbid` for the previous highest bidder.
- `auction:closed` when a scheduled auction close completes.
- `auction:suspended`, `auction:resumed`, and `auction:cancelled` for admin
  moderation actions.

On connect, the gateway attempts to read the access token cookie. Authenticated
sockets join a personal `user:{userId}` room for user-targeted events.

## Core behavior

- Auctions can be `active`, `closed`, `cancelled`, or `suspended`.
- Each item can have only one live auction at a time.
- Sellers cannot bid on their own items.
- Bids are checked against a Redis highest-bid cache first, then serialized in
  PostgreSQL with a row-level `FOR UPDATE` lock on the auction.
- Accepted bids emit real-time events and queue outbid notifications.
- Auction close jobs are scheduled in BullMQ when auctions are created or their
  end time changes.
- Closing an auction picks the highest bid, sets the winner, clears bid cache,
  emits an event, and queues seller/winner notifications.
- Admin actions can freeze, unfreeze, cancel auctions, ban users, and inspect
  suspicious auctions with bursty recent bidding.

## Development without Docker

Start PostgreSQL and both Redis instances yourself, then from `server/`:

```bash
npm install
npm run db:migrate
npm run start:dev
```

Useful server commands:

```bash
npm run build
npm run lint
npm run format
npm run db:generate
npm run db:migrate
npm run db:seed
```

The seed command creates an admin, seller, bidder, several items, and sample
auctions. Seeded users use `password123`.

## Testing

From `server/`:

```bash
npm run test
npm run test:e2e
npm run test:cov
```

The e2e tests use Testcontainers, so Docker must be available to the test
process.

## Load testing

The `load/` directory contains k6 scenarios:

- `01-baseline.js` checks parallel bid sanity without contention.
- `02-moderate.js` checks correctness under shared-auction contention.
- `03-stress.js` ramps to 1000 virtual users to find the latency ceiling.
- `validate.js` checks PostgreSQL and Redis integrity after a contended run.

Run a scenario through Compose:

```bash
docker compose run --rm k6 run /scripts/03-stress.js
```

See `load/README.md` for the full load-testing workflow and recorded stress
results.

## More docs

- `server/README.md` currently contains the original NestJS starter notes.
- `server/docs/auctions-gateway.spec.yaml` documents the auction gateway shape.
- `load/README.md` documents load-test setup, scenarios, and interpretation.
