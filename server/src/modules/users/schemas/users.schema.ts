import { relations } from 'drizzle-orm';
import { pgEnum } from 'drizzle-orm/pg-core';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { timestamps } from 'src/common/schemas';
import { sessions } from 'src/modules/auth/schemas';
import { bids } from 'src/modules/bids/schemas';
import { items } from 'src/modules/items/schemas';
import { auctions } from 'src/modules/auctions/schemas';
import { USER_ROLES } from '../constants';
import { timestamp } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', USER_ROLES);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  role: roleEnum().default('user').notNull(),
  bannedAt: timestamp('banned_at'),
  ...timestamps,
});

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  items: many(items),
  bids: many(bids),
  wonAuctions: many(auctions),
}));
