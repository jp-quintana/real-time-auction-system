ALTER TABLE "bids" RENAME COLUMN "user_id" TO "bidder_id";--> statement-breakpoint
ALTER TABLE "items" RENAME COLUMN "user_id" TO "seller_id";--> statement-breakpoint
ALTER TABLE "bids" DROP CONSTRAINT "bids_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "auctions" ALTER COLUMN "start_time" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_users_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;