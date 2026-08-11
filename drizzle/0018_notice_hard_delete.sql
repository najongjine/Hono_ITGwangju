DELETE FROM "t_file_links"
WHERE "target_table" = 't_notices'
  AND "target_id" IN (
    SELECT "id" FROM "t_notices" WHERE "status" = 'deleted'
  );
--> statement-breakpoint
DELETE FROM "t_notices" WHERE "status" = 'deleted';
--> statement-breakpoint
ALTER TABLE "t_notices" DROP CONSTRAINT "t_notices_status_check";
--> statement-breakpoint
ALTER TABLE "t_notices"
  ADD CONSTRAINT "t_notices_status_check"
  CHECK ("status" IN ('published', 'hidden'));
--> statement-breakpoint
DROP INDEX "idx_t_notices_visible_pinned";
--> statement-breakpoint
ALTER TABLE "t_notices" DROP COLUMN "is_visible";
--> statement-breakpoint
CREATE INDEX "idx_t_notices_status_pinned"
  ON "t_notices" ("status", "is_pinned", "created_at");
--> statement-breakpoint
COMMENT ON COLUMN "t_notices"."status" IS '공지 상태: published(게시), hidden(숨김)';
