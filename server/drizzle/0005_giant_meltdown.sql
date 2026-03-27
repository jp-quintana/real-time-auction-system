CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "role" DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;