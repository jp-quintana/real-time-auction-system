import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as usersSchema from '../src/modules/users/schemas';
import * as sessionsSchema from '../src/modules/auth/schemas';
import * as itemsSchema from '../src/modules/items/schemas';
import * as auctionsSchema from '../src/modules/auctions/schemas';
import * as bidsSchema from '../src/modules/bids/schemas';

export const schema = {
  ...usersSchema,
  ...sessionsSchema,
  ...itemsSchema,
  ...auctionsSchema,
  ...bidsSchema,
};

export interface TestDb {
  container: StartedPostgreSqlContainer;
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
  connectionUri: string;
}

export async function setupTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('auction_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const connectionUri = container.getConnectionUri();
  const pool = new Pool({ connectionString: connectionUri });
  const db = drizzle(pool, { schema });

  await migrate(db, { migrationsFolder: './drizzle' });

  return { container, pool, db, connectionUri };
}

export async function teardownTestDb(testDb: TestDb) {
  await testDb.pool.end();
  await testDb.container.stop();
}
