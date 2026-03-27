import { relations } from 'drizzle-orm';
import { numeric } from 'drizzle-orm/pg-core';
import { pgTable, uuid, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { timestamps } from 'src/common/schemas';
import { items } from 'src/modules/items/schemas';

export const statusEnum = pgEnum('status', ['active', 'closed', 'cancelled']);

export const auctions = pgTable('auctions', {
  id: uuid('id').primaryKey().defaultRandom(),
  startingPrice: numeric('starting_price', {
    precision: 10,
    scale: 2,
  }).notNull(),
  startTime: timestamp('start_time').defaultNow(),
  endTime: timestamp('end_time').notNull(),
  status: statusEnum().default('active'),
  itemId: uuid('item_id')
    .references(() => items.id, { onDelete: 'cascade' })
    .notNull(),
  ...timestamps,
});

export const auctionRelations = relations(auctions, ({ one }) => ({
  item: one(items, {
    fields: [auctions.itemId],
    references: [items.id],
  }),
}));
