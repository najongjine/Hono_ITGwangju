CREATE TABLE "t_user_registermeta" (
	"id" serial PRIMARY KEY NOT NULL,
	"signup_ip" varchar(45),
	"signup_user_agent" text,
	"created_dt" timestamp with time zone DEFAULT now(),
	"user_id" integer
);
--> statement-breakpoint
ALTER TABLE "t_user_registermeta" ADD CONSTRAINT "t_user_registermeta_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_t_user_registermeta_user_id" ON "t_user_registermeta" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "t_user_registermeta" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL ON TABLE "t_user_registermeta" FROM anon;
		REVOKE ALL ON SEQUENCE "t_user_registermeta_id_seq" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL ON TABLE "t_user_registermeta" FROM authenticated;
		REVOKE ALL ON SEQUENCE "t_user_registermeta_id_seq" FROM authenticated;
	END IF;
END
$$;
--> statement-breakpoint
COMMENT ON TABLE "t_user_registermeta" IS '회원가입 요청 메타데이터';
--> statement-breakpoint
COMMENT ON COLUMN "t_user_registermeta"."id" IS '회원가입 메타데이터 식별자';
--> statement-breakpoint
COMMENT ON COLUMN "t_user_registermeta"."signup_ip" IS '회원가입 요청 IP';
--> statement-breakpoint
COMMENT ON COLUMN "t_user_registermeta"."signup_user_agent" IS '회원가입 요청 User-Agent';
--> statement-breakpoint
COMMENT ON COLUMN "t_user_registermeta"."created_dt" IS '회원가입 메타데이터 생성 시각';
--> statement-breakpoint
COMMENT ON COLUMN "t_user_registermeta"."user_id" IS '가입한 회원 식별자';
