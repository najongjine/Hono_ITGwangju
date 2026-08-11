DELETE FROM "t_inquiries" WHERE "user_id" IS NULL;--> statement-breakpoint

ALTER TABLE "t_inquiries" DROP CONSTRAINT IF EXISTS "t_inquiries_user_id_fkey";--> statement-breakpoint
ALTER TABLE "t_inquiries" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "t_inquiries"
  ADD CONSTRAINT "t_inquiries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id")
  ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "t_inquiries" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "t_inquiries" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "t_inquiries" DROP COLUMN "email";
