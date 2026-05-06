ALTER TABLE "t_files" ADD COLUMN "storage_type" varchar DEFAULT 'local';--> statement-breakpoint
ALTER TABLE "t_files" ADD COLUMN "bucket" varchar DEFAULT '';--> statement-breakpoint
ALTER TABLE "t_files" ADD COLUMN "storage_key" varchar DEFAULT '';--> statement-breakpoint
ALTER TABLE "t_files" ADD COLUMN "public_url" varchar DEFAULT '';