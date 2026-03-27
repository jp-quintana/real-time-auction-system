CREATE TYPE "public"."status" AS ENUM('active', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starting_price" numeric(10, 2) NOT NULL,
	"start_time" timestamp DEFAULT now(),
	"end_time" timestamp NOT NULL,
	"status" "status" DEFAULT 'active',
	"item_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;