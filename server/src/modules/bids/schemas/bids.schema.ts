import { relations } from 'drizzle-orm';
import { pgTable, uuid, numeric, index } from 'drizzle-orm/pg-core';
import { timestamps } from 'src/common/schemas';
import { auctions } from 'src/modules/auctions/schemas';
import { users } from 'src/modules/users/schemas';

export const bids = pgTable(
  'bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    amount: numeric('amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    auctionId: uuid('auction_id')
      .references(() => auctions.id, { onDelete: 'cascade' })
      .notNull(),
    bidderId: uuid('bidder_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('bids_auction_amount_idx').on(table.auctionId, table.amount.desc()),
  ],
);

export const bidRelations = relations(bids, ({ one }) => ({
  auction: one(auctions, {
    fields: [bids.auctionId],
    references: [auctions.id],
  }),
  bidder: one(users, {
    fields: [bids.bidderId],
    references: [users.id],
  }),
}));
