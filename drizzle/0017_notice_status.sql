UPDATE "t_notices"
SET
  "status" = CASE
    WHEN "status" = 'deleted' THEN 'deleted'
    WHEN "status" = 'published' AND "is_visible" IS NOT FALSE THEN 'published'
    ELSE 'hidden'
  END,
  "is_visible" = CASE
    WHEN "status" = 'published' AND "is_visible" IS NOT FALSE THEN true
    ELSE false
  END;
--> statement-breakpoint
ALTER TABLE "t_notices"
  ADD CONSTRAINT "t_notices_status_check"
  CHECK ("status" IN ('published', 'hidden', 'deleted'));
--> statement-breakpoint
COMMENT ON COLUMN "t_notices"."status" IS '공지 상태: published(게시), hidden(숨김), deleted(삭제)';
