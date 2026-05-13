CREATE TABLE IF NOT EXISTS "t_inquiry_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"inquiry_id" integer NOT NULL,
	"user_id" integer,
	"author_role" varchar DEFAULT 'user' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_t_inquiry_replies_inquiry_id" ON "t_inquiry_replies" USING btree ("inquiry_id" int4_ops);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "t_inquiry_replies" ADD CONSTRAINT "t_inquiry_replies_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."t_inquiries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "t_inquiry_replies" ADD CONSTRAINT "t_inquiry_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "t_inquiry_replies" ("inquiry_id", "user_id", "author_role", "content", "status", "created_at", "updated_at")
SELECT "id", "answered_by", 'admin', "answer", 'active', COALESCE("answered_at", "updated_at", now()), COALESCE("answered_at", "updated_at", now())
FROM "t_inquiries"
WHERE COALESCE("answer", '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "t_inquiry_replies"
    WHERE "t_inquiry_replies"."inquiry_id" = "t_inquiries"."id"
      AND "t_inquiry_replies"."author_role" = 'admin'
      AND "t_inquiry_replies"."content" = "t_inquiries"."answer"
  );
