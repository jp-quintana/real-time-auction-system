import { relations, sql } from 'drizzle-orm';
import { uniqueIndex } from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
import { pgTable, uuid, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import {
  AUCTION_STATUS_ACTIVE,
  AUCTION_STATUS_VALUES,
} from 'src/common/constants';
import { timestamps } from 'src/common/schemas';
import { bids } from 'src/modules/bids/schemas';
import { items } from 'src/modules/items/schemas';

export const statusEnum = pgEnum('status', AUCTION_STATUS_VALUES);

export const auctions = pgTable(
  'auctions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    startingPrice: numeric('starting_price', {
      precision: 10,
      scale: 2,
    }).notNull(),
    startTime: timestamp('start_time').defaultNow().notNull(),
    endTime: timestamp('end_time').notNull(),
    status: statusEnum().default('active').notNull(),
    itemId: uuid('item_id')
      .references(() => items.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('auctions_one_active_per_item')
      .on(table.itemId)
      .where(
        sql`${table.status} = ${sql.raw(`'${AUCTION_STATUS_ACTIVE}'`)} AND ${table.deletedAt} IS NULL`,
      ),
  ],
);

export const auctionRelations = relations(auctions, ({ one, many }) => ({
  item: one(items, {
    fields: [auctions.itemId],
    references: [items.id],
  }),
  bids: many(bids),
}));
