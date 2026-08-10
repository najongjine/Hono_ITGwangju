DROP TABLE IF EXISTS "t_apply" CASCADE;--> statement-breakpoint

DELETE FROM "t_enrollments" WHERE "user_id" IS NULL;--> statement-breakpoint

ALTER TABLE "t_enrollments" DROP CONSTRAINT IF EXISTS "t_enrollments_user_id_fkey";--> statement-breakpoint
ALTER TABLE "t_enrollments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "t_enrollments"
  ADD CONSTRAINT "t_enrollments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id")
  ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "t_enrollments" ADD COLUMN "status" varchar DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE "t_enrollments"
SET "status" = CASE
  WHEN "approval_status" IN ('approved', 'completed') THEN 'approved'
  WHEN "approval_status" = 'rejected' THEN 'rejected'
  ELSE 'pending'
END;--> statement-breakpoint

ALTER TABLE "t_enrollments" DROP COLUMN "applicant_name";--> statement-breakpoint
ALTER TABLE "t_enrollments" DROP COLUMN "applicant_phone";--> statement-breakpoint
ALTER TABLE "t_enrollments" DROP COLUMN "applicant_email";--> statement-breakpoint
ALTER TABLE "t_enrollments" DROP COLUMN "apply_status";--> statement-breakpoint
ALTER TABLE "t_enrollments" DROP COLUMN "approval_status";--> statement-breakpoint
ALTER TABLE "t_enrollments" ALTER COLUMN "memo" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "t_enrollments" ALTER COLUMN "memo" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "t_enrollments"
  ADD CONSTRAINT "t_enrollments_status_check"
  CHECK ("status" IN ('pending', 'approved', 'rejected'));
