ALTER TABLE "t_banner" DROP CONSTRAINT "t_banner_created_by_fkey", ADD CONSTRAINT "t_banner_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_banner" DROP CONSTRAINT "t_banner_image_file_id_fkey", ADD CONSTRAINT "t_banner_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "public"."t_files"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_banner" DROP CONSTRAINT "t_banner_updated_by_fkey", ADD CONSTRAINT "t_banner_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_course_sessions" DROP CONSTRAINT "t_course_sessions_course_id_fkey", ADD CONSTRAINT "t_course_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."t_courses"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_courses" DROP CONSTRAINT "t_courses_created_by_fkey", ADD CONSTRAINT "t_courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_courses" DROP CONSTRAINT "t_courses_thumbnail_file_id_fkey", ADD CONSTRAINT "t_courses_thumbnail_file_id_fkey" FOREIGN KEY ("thumbnail_file_id") REFERENCES "public"."t_files"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_courses" DROP CONSTRAINT "t_courses_updated_by_fkey", ADD CONSTRAINT "t_courses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_enrollments" DROP CONSTRAINT "t_enrollments_course_id_fkey", ADD CONSTRAINT "t_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."t_courses"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_enrollments" DROP CONSTRAINT "t_enrollments_session_id_fkey", ADD CONSTRAINT "t_enrollments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."t_course_sessions"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_enrollments" DROP CONSTRAINT "t_enrollments_user_id_fkey", ADD CONSTRAINT "t_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_file_links" DROP CONSTRAINT "t_file_links_file_id_fkey", ADD CONSTRAINT "t_file_links_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."t_files"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_files" DROP CONSTRAINT "t_files_uploaded_by_fkey", ADD CONSTRAINT "t_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_inquiries" DROP CONSTRAINT "t_inquiries_user_id_fkey", ADD CONSTRAINT "t_inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_inquiry_replies" DROP CONSTRAINT "t_inquiry_replies_inquiry_id_fkey", ADD CONSTRAINT "t_inquiry_replies_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."t_inquiries"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_inquiry_replies" DROP CONSTRAINT "t_inquiry_replies_user_id_fkey", ADD CONSTRAINT "t_inquiry_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_notices" DROP CONSTRAINT "t_notices_user_id_fkey", ADD CONSTRAINT "t_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_test1_child" DROP CONSTRAINT "t_test1_child_test1_id_t_test1_id_fk", ADD CONSTRAINT "t_test1_child_test1_id_t_test1_id_fk" FOREIGN KEY ("test1_id") REFERENCES "public"."t_test1"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_user_registermeta" DROP CONSTRAINT "t_user_registermeta_user_id_fkey", ADD CONSTRAINT "t_user_registermeta_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "t_user_roles" DROP CONSTRAINT "fk_user_roles_user", ADD CONSTRAINT "fk_user_roles_user" FOREIGN KEY ("user_id") REFERENCES "public"."t_user"("id") ON UPDATE cascade ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "idx_t_banner_created_by" ON "t_banner" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "idx_t_banner_image_file_id" ON "t_banner" USING btree ("image_file_id");
--> statement-breakpoint
CREATE INDEX "idx_t_banner_updated_by" ON "t_banner" USING btree ("updated_by");
--> statement-breakpoint
CREATE INDEX "idx_t_courses_created_by" ON "t_courses" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "idx_t_courses_thumbnail_file_id" ON "t_courses" USING btree ("thumbnail_file_id");
--> statement-breakpoint
CREATE INDEX "idx_t_courses_updated_by" ON "t_courses" USING btree ("updated_by");
--> statement-breakpoint
CREATE INDEX "idx_t_enrollments_session_id" ON "t_enrollments" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "idx_t_files_uploaded_by" ON "t_files" USING btree ("uploaded_by");
--> statement-breakpoint
CREATE INDEX "idx_t_inquiries_user_id" ON "t_inquiries" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_t_inquiry_replies_user_id" ON "t_inquiry_replies" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_t_notices_user_id" ON "t_notices" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_t_test1_child_test1_id" ON "t_test1_child" USING btree ("test1_id");
--> statement-breakpoint
CREATE INDEX "idx_t_user_roles_user_id" ON "t_user_roles" USING btree ("user_id");
