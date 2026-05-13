CREATE TABLE IF NOT EXISTS "t_banner" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar DEFAULT '' NOT NULL,
	"subtitle" varchar DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_file_id" integer,
	"link_url" varchar DEFAULT '' NOT NULL,
	"link_target" varchar DEFAULT '_self' NOT NULL,
	"position" varchar DEFAULT 'main' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_t_banner_position_visible" ON "t_banner" USING btree ("position" text_ops, "is_visible" bool_ops, "status" text_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_t_banner_sort_order" ON "t_banner" USING btree ("sort_order" int4_ops, "created_at" timestamp_ops);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "t_banner" ADD CONSTRAINT "t_banner_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "public"."t_files"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "t_banner" ADD CONSTRAINT "t_banner_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."t_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "t_banner" ADD CONSTRAINT "t_banner_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."t_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
