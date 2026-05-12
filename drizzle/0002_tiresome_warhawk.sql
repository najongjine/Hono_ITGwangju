ALTER TABLE "t_course_sessions" ADD COLUMN "class_time" varchar;--> statement-breakpoint
ALTER TABLE "t_course_sessions" DROP COLUMN "apply_start_date";--> statement-breakpoint
ALTER TABLE "t_course_sessions" DROP COLUMN "apply_end_date";--> statement-breakpoint
ALTER TABLE "t_course_sessions" DROP COLUMN "location";
