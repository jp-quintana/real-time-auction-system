import { relations } from 'drizzle-orm';
import { uuid, pgTable, text } from 'drizzle-orm/pg-core';
import { timestamps } from 'src/common/schemas';
import { auctions } from 'src/modules/auctions/schemas';
import { users } from 'src/modules/users/schemas';

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  sellerId: uuid('seller_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  ...timestamps,
});

export const itemRelations = relations(items, ({ one, many }) => ({
  seller: one(users, {
    fields: [items.sellerId],
    references: [users.id],
  }),
  auctions: many(auctions),
}));
