ALTER TABLE "t_user" ADD COLUMN "zipcode" varchar(20);
--> statement-breakpoint
ALTER TABLE "t_user" ADD COLUMN "road_address" varchar(500);
--> statement-breakpoint
ALTER TABLE "t_user" ADD COLUMN "detail_address" varchar;
--> statement-breakpoint
COMMENT ON COLUMN "t_user"."zipcode" IS '회원 우편번호';
--> statement-breakpoint
COMMENT ON COLUMN "t_user"."road_address" IS '회원 도로명 주소';
--> statement-breakpoint
COMMENT ON COLUMN "t_user"."detail_address" IS '양방향 암호화된 회원 상세 주소';
