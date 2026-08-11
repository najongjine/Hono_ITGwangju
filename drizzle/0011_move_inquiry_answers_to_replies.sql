INSERT INTO "t_inquiry_replies" (
  "inquiry_id",
  "user_id",
  "author_role",
  "content",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "answered_by",
  'staff',
  "answer",
  'active',
  COALESCE("answered_at", "updated_at", "created_at", now()),
  COALESCE("answered_at", "updated_at", "created_at", now())
FROM "t_inquiries"
WHERE NULLIF(BTRIM("answer"), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "t_inquiry_replies" reply
    WHERE reply."inquiry_id" = "t_inquiries"."id"
      AND reply."content" = "t_inquiries"."answer"
      AND reply."status" <> 'deleted'
  );--> statement-breakpoint

ALTER TABLE "t_inquiries" DROP CONSTRAINT IF EXISTS "t_inquiries_answered_by_fkey";--> statement-breakpoint
ALTER TABLE "t_inquiries" DROP COLUMN "answer";--> statement-breakpoint
ALTER TABLE "t_inquiries" DROP COLUMN "answered_by";--> statement-breakpoint
ALTER TABLE "t_inquiries" DROP COLUMN "answered_at";
