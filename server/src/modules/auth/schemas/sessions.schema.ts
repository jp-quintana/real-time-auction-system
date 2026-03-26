import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { timestamps } from 'src/common/schemas';
import { users } from 'src/modules/users/schemas';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  hashedRefreshToken: text('hashed_refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  userId: uuid('user_id').references(() => users.id),
  ...timestamps,
});

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
