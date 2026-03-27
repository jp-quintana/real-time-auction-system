DROP INDEX "bids_auction_amount_idx";--> statement-breakpoint
ALTER TABLE "bids" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "bids_auction_amount_idx" ON "bids" USING btree ("auction_id","amount" DESC NULLS LAST);