ALTER TABLE "t_notices" RENAME COLUMN "author_id" TO "user_id";
--> statement-breakpoint
ALTER TABLE "t_notices" DROP COLUMN "author_name";
--> statement-breakpoint
ALTER TABLE "t_notices"
  RENAME CONSTRAINT "t_notices_author_id_fkey" TO "t_notices_user_id_fkey";
--> statement-breakpoint
COMMENT ON COLUMN "t_notices"."user_id" IS '공지 작성 회원 식별자';
