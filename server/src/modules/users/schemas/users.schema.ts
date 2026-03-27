import { relations } from 'drizzle-orm';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { timestamps } from 'src/common/schemas';
import { sessions } from 'src/modules/auth/schemas';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  ...timestamps,
});

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));
