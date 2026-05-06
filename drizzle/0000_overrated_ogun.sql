CREATE TABLE "t_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "t_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"original_name" varchar DEFAULT '',
	"stored_name" varchar DEFAULT '',
	"file_path" varchar DEFAULT '',
	"mime_type" varchar DEFAULT '',
	"file_size" bigint DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "t_test1" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "t_test1_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar DEFAULT '',
	"content" varchar DEFAULT '',
	"created_dt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "t_test1_child" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "t_test1_child_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"comment" varchar DEFAULT '',
	"created_dt" timestamp with time zone DEFAULT now(),
	"test1_id" integer
);
--> statement-breakpoint
ALTER TABLE "t_test1_child" ADD CONSTRAINT "t_test1_child_test1_id_t_test1_id_fk" FOREIGN KEY ("test1_id") REFERENCES "public"."t_test1"("id") ON DELETE cascade ON UPDATE cascade;