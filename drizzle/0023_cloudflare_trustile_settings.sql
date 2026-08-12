CREATE TABLE "t_settings" (
	"id" integer DEFAULT 1 PRIMARY KEY NOT NULL,
	"cloudflare_trustile" boolean DEFAULT true NOT NULL,
	"created_dt" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_dt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "t_settings_singleton_check" CHECK ("t_settings"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "t_settings" ("id", "cloudflare_trustile")
VALUES (1, true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "t_user_registermeta" ADD COLUMN "cloudflare_trustile" varchar(20) DEFAULT 'notchecked' NOT NULL;
--> statement-breakpoint
ALTER TABLE "t_user_registermeta" ADD CONSTRAINT "t_user_registermeta_cloudflare_trustile_check" CHECK ("t_user_registermeta"."cloudflare_trustile" IN ('checked', 'notchecked', 'justallowed'));
--> statement-breakpoint
ALTER TABLE "t_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		REVOKE ALL ON TABLE "t_settings" FROM anon;
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		REVOKE ALL ON TABLE "t_settings" FROM authenticated;
	END IF;
END
$$;
--> statement-breakpoint
COMMENT ON TABLE "t_settings" IS '전역 서비스 설정(단일 행)';
--> statement-breakpoint
COMMENT ON COLUMN "t_settings"."cloudflare_trustile" IS '회원가입 시 Cloudflare Turnstile 검증 강제 여부';
--> statement-breakpoint
COMMENT ON COLUMN "t_user_registermeta"."cloudflare_trustile" IS 'Turnstile 가입 경로: checked, notchecked, justallowed';
