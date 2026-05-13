import { pgTable, index, foreignKey, serial, integer, varchar, date, timestamp, time, text, boolean, unique, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const tCourseSessions = pgTable("t_course_sessions", {
	id: serial().primaryKey().notNull(),
	courseId: integer("course_id").notNull(),
	sessionName: varchar("session_name"),
	sessionNo: integer("session_no"),
	startDate: date("start_date"),
	endDate: date("end_date"),
	capacity: integer().default(20),
	status: varchar().default('recruiting'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	classStartTime: time("class_start_time"),
	classEndTime: time("class_end_time"),
}, (table) => [
	index("idx_t_course_sessions_course_id").using("btree", table.courseId.asc().nullsLast().op("int4_ops")),
	index("idx_t_course_sessions_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [tCourses.id],
			name: "t_course_sessions_course_id_fkey"
		}).onDelete("cascade"),
]);

export const tCourses = pgTable("t_courses", {
	id: serial().primaryKey().notNull(),
	courseName: varchar("course_name").notNull(),
	summary: varchar().default(""),
	description: text().default(""),
	thumbnailFileId: integer("thumbnail_file_id"),
	isVisible: boolean("is_visible").default(true),
	status: varchar().default('active'),
	sortOrder: integer("sort_order").default(0),
	createdBy: integer("created_by"),
	updatedBy: integer("updated_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_t_courses_visible_status").using("btree", table.isVisible.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [tUser.id],
			name: "t_courses_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.thumbnailFileId],
			foreignColumns: [tFiles.id],
			name: "t_courses_thumbnail_file_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [tUser.id],
			name: "t_courses_updated_by_fkey"
		}).onDelete("set null"),
]);

export const tUser = pgTable("t_user", {
	id: serial().primaryKey().notNull(),
	provider: varchar().default('google'),
	providerUserId: varchar("provider_user_id"),
	email: varchar(),
	profileImageUrl: varchar("profile_image_url").default(""),
	role: varchar().default('user'),
	status: varchar().default('active'),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	username: varchar({ length: 255 }),
	password: varchar(),
	realName: varchar("real_name", { length: 255 }),
	phone: varchar(),
}, (table) => [
	unique("t_user_provider_user_id_uk").on(table.provider, table.providerUserId),
	unique("t_user_email_uk").on(table.email),
]);

export const tEnrollments = pgTable("t_enrollments", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id"),
	courseId: integer("course_id").notNull(),
	sessionId: integer("session_id").notNull(),
	applicantName: varchar("applicant_name").default("").notNull(),
	applicantPhone: varchar("applicant_phone").default("").notNull(),
	applicantEmail: varchar("applicant_email").default("").notNull(),
	applyStatus: varchar("apply_status").default('submitted').notNull(),
	approvalStatus: varchar("approval_status").default('pending').notNull(),
	memo: text().default("").notNull(),
	appliedAt: timestamp("applied_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_t_enrollments_course_session").using("btree", table.courseId.asc().nullsLast().op("int4_ops"), table.sessionId.asc().nullsLast().op("int4_ops")),
	index("idx_t_enrollments_user_id").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [tCourses.id],
			name: "t_enrollments_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [tCourseSessions.id],
			name: "t_enrollments_session_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [tUser.id],
			name: "t_enrollments_user_id_fkey"
		}).onDelete("set null"),
	unique("t_enrollments_user_session_uk").on(table.userId, table.sessionId),
]);

export const tApply = pgTable("t_apply", {
	id: serial().primaryKey().notNull(),
	enrollmentId: integer("enrollment_id"),
	userId: integer("user_id"),
	sessionId: integer("session_id"),
	applicantName: varchar("applicant_name").default("").notNull(),
	phone: varchar().default("").notNull(),
	email: varchar().default("").notNull(),
	birthDate: date("birth_date"),
	gender: varchar().default("").notNull(),
	address: varchar().default("").notNull(),
	detailAddress: varchar("detail_address").default("").notNull(),
	currentJob: varchar("current_job").default("").notNull(),
	educationLevel: varchar("education_level").default("").notNull(),
	applicationContent: text("application_content").default("").notNull(),
	privacyAgreed: boolean("privacy_agreed").default(false).notNull(),
	status: varchar().default('submitted').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_t_apply_enrollment_id").using("btree", table.enrollmentId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.enrollmentId],
			foreignColumns: [tEnrollments.id],
			name: "t_apply_enrollment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [tCourseSessions.id],
			name: "t_apply_session_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [tUser.id],
			name: "t_apply_user_id_fkey"
		}).onDelete("set null"),
]);

export const tNotices = pgTable("t_notices", {
	id: serial().primaryKey().notNull(),
	title: varchar().notNull(),
	content: text().default(""),
	authorId: integer("author_id"),
	authorName: varchar("author_name").default(""),
	viewCount: integer("view_count").default(0),
	isVisible: boolean("is_visible").default(true),
	isPinned: boolean("is_pinned").default(false),
	status: varchar().default('published'),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_t_notices_visible_pinned").using("btree", table.isVisible.asc().nullsLast().op("bool_ops"), table.isPinned.asc().nullsLast().op("timestamp_ops"), table.createdAt.desc().nullsFirst().op("bool_ops")),
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [tUser.id],
			name: "t_notices_author_id_fkey"
		}).onDelete("set null"),
]);

export const tPosts = pgTable("t_posts", {
	id: serial().primaryKey().notNull(),
	category: varchar().default('general').notNull(),
	title: varchar().notNull(),
	content: text().default("").notNull(),
	authorId: integer("author_id"),
	authorName: varchar("author_name").default("").notNull(),
	viewCount: integer("view_count").default(0).notNull(),
	isVisible: boolean("is_visible").default(true).notNull(),
	status: varchar().default('published').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_t_posts_category_status").using("btree", table.category.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.authorId],
			foreignColumns: [tUser.id],
			name: "t_posts_author_id_fkey"
		}).onDelete("set null"),
]);

export const tTest1 = pgTable("t_test1", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "t_test1_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	title: varchar().default(""),
	content: varchar().default(""),
	createdDt: timestamp("created_dt", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const tTest1Child = pgTable("t_test1_child", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "t_test1_child_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	comment: varchar().default(""),
	createdDt: timestamp("created_dt", { withTimezone: true, mode: 'string' }).defaultNow(),
	test1Id: integer("test1_id"),
}, (table) => [
	foreignKey({
			columns: [table.test1Id],
			foreignColumns: [tTest1.id],
			name: "t_test1_child_test1_id_t_test1_id_fk"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const tInquiries = pgTable("t_inquiries", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id"),
	name: varchar().default(""),
	phone: varchar().default(""),
	email: varchar().default(""),
	title: varchar(),
	content: text().default(""),
	answer: text().default(""),
	answeredBy: integer("answered_by"),
	answeredAt: timestamp("answered_at", { mode: 'string' }),
	status: varchar().default('waiting'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_t_inquiries_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.answeredBy],
			foreignColumns: [tUser.id],
			name: "t_inquiries_answered_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [tUser.id],
			name: "t_inquiries_user_id_fkey"
	}).onDelete("set null"),
]);

export const tInquiryReplies = pgTable("t_inquiry_replies", {
	id: serial().primaryKey().notNull(),
	inquiryId: integer("inquiry_id").notNull(),
	userId: integer("user_id"),
	authorRole: varchar("author_role").default('user').notNull(),
	content: text().default("").notNull(),
	status: varchar().default('active').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_t_inquiry_replies_inquiry_id").using("btree", table.inquiryId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.inquiryId],
			foreignColumns: [tInquiries.id],
			name: "t_inquiry_replies_inquiry_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [tUser.id],
			name: "t_inquiry_replies_user_id_fkey"
	}).onDelete("set null"),
]);

export const tFiles = pgTable("t_files", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "t_files_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	originalName: varchar("original_name").default(""),
	storedName: varchar("stored_name").default(""),
	filePath: varchar("file_path").default(""),
	mimeType: varchar("mime_type").default(""),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }).default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storageType: varchar("storage_type").default('local'),
	bucket: varchar().default(""),
	storageKey: varchar("storage_key").default(""),
	publicUrl: varchar("public_url").default(""),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	uploadedBy: integer("uploaded_by"),
	status: varchar().default('active').notNull(),
}, (table) => [
	index("idx_t_files_storage_type").using("btree", table.storageType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [tUser.id],
			name: "t_files_uploaded_by_fkey"
		}).onDelete("set null"),
]);

export const tFileLinks = pgTable("t_file_links", {
	id: serial().primaryKey().notNull(),
	fileId: integer("file_id").notNull(),
	targetTable: varchar("target_table").notNull(),
	targetId: integer("target_id").notNull(),
	fileRole: varchar("file_role").default('attachment'),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_t_file_links_file_id").using("btree", table.fileId.asc().nullsLast().op("int4_ops")),
	index("idx_t_file_links_target").using("btree", table.targetTable.asc().nullsLast().op("int4_ops"), table.targetId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.fileId],
			foreignColumns: [tFiles.id],
			name: "t_file_links_file_id_fkey"
		}).onDelete("cascade"),
	unique("t_file_links_target_uk").on(table.fileId, table.targetTable, table.targetId, table.fileRole),
]);

export const tUserRoles = pgTable("t_user_roles", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	roleName: varchar("role_name", { length: 250 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [tUser.id],
			name: "fk_user_roles_user"
		}).onDelete("cascade"),
]);
