import { relations } from 'drizzle-orm';
import { pgEnum } from 'drizzle-orm/pg-core';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { timestamps } from 'src/common/schemas';
import { sessions } from 'src/modules/auth/schemas';
import { items } from 'src/modules/items/schemas';

export const roleEnum = pgEnum('role', ['user', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  role: roleEnum().default('user'),
  ...timestamps,
});

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  items: many(items),
}));
