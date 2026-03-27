import { relations } from 'drizzle-orm';
import { uuid, pgTable, text } from 'drizzle-orm/pg-core';
import { timestamps } from 'src/common/schemas';
import { users } from 'src/modules/users/schemas';

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title'),
  description: text('description'),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  ...timestamps,
});

export const itemRelations = relations(items, ({ one }) => ({
  user: one(users, {
    fields: [items.userId],
    references: [users.id],
  }),
}));
