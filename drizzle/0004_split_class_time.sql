ALTER TABLE "t_course_sessions" ADD COLUMN "class_start_time" time;--> statement-breakpoint
ALTER TABLE "t_course_sessions" ADD COLUMN "class_end_time" time;--> statement-breakpoint
ALTER TABLE "t_course_sessions" DROP COLUMN IF EXISTS "class_time";
