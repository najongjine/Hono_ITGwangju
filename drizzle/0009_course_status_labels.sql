ALTER TABLE "t_courses" ALTER COLUMN "status" SET DEFAULT '운영중';--> statement-breakpoint
ALTER TABLE "t_course_sessions" ALTER COLUMN "status" SET DEFAULT '모집중';--> statement-breakpoint
UPDATE "t_courses"
SET "status" = CASE
  WHEN "status" IN ('active', 'running', 'ongoing') THEN '운영중'
  WHEN "status" IN ('recruiting', 'recruit', 'open') THEN '모집중'
  WHEN "status" IN ('closed', 'completed', 'ended', 'end', '종료') THEN '마감'
  ELSE "status"
END
WHERE "status" IS NOT NULL
  AND "status" <> 'deleted';--> statement-breakpoint
UPDATE "t_course_sessions"
SET "status" = CASE
  WHEN "status" IN ('active', 'running', 'ongoing') THEN '운영중'
  WHEN "status" IN ('recruiting', 'recruit', 'open') THEN '모집중'
  WHEN "status" IN ('closed', 'completed', 'ended', 'end', '종료') THEN '마감'
  ELSE "status"
END
WHERE "status" IS NOT NULL
  AND "status" <> 'deleted';
