import { drizzle } from 'drizzle-orm/node-postgres';
import * as usersSchema from '../../modules/users/schemas';
import * as sessionsSchema from '../../modules/auth/schemas';
import * as itemsSchema from '../../modules/items/schemas';
import * as auctionsSchema from '../../modules/auctions/schemas';
import * as bidsSchema from '../../modules/bids/schemas';

export const schema = {
  ...usersSchema,
  ...sessionsSchema,
  ...itemsSchema,
  ...auctionsSchema,
  ...bidsSchema,
};

export type Database = ReturnType<typeof drizzle<typeof schema>>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
