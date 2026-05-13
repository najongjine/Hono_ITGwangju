import { relations } from "drizzle-orm/relations";
import { tCourses, tCourseSessions, tUser, tFiles, tEnrollments, tApply, tNotices, tPosts, tTest1, tTest1Child, tInquiries, tInquiryReplies, tFileLinks, tUserRoles } from "./schema.js";
export const tCourseSessionsRelations = relations(tCourseSessions, ({ one, many }) => ({
    tCourse: one(tCourses, {
        fields: [tCourseSessions.courseId],
        references: [tCourses.id]
    }),
    tEnrollments: many(tEnrollments),
    tApplies: many(tApply),
}));
export const tCoursesRelations = relations(tCourses, ({ one, many }) => ({
    tCourseSessions: many(tCourseSessions),
    tUser_createdBy: one(tUser, {
        fields: [tCourses.createdBy],
        references: [tUser.id],
        relationName: "tCourses_createdBy_tUser_id"
    }),
    tFile: one(tFiles, {
        fields: [tCourses.thumbnailFileId],
        references: [tFiles.id]
    }),
    tUser_updatedBy: one(tUser, {
        fields: [tCourses.updatedBy],
        references: [tUser.id],
        relationName: "tCourses_updatedBy_tUser_id"
    }),
    tEnrollments: many(tEnrollments),
}));
export const tUserRelations = relations(tUser, ({ many }) => ({
    tCourses_createdBy: many(tCourses, {
        relationName: "tCourses_createdBy_tUser_id"
    }),
    tCourses_updatedBy: many(tCourses, {
        relationName: "tCourses_updatedBy_tUser_id"
    }),
    tEnrollments: many(tEnrollments),
    tApplies: many(tApply),
    tNotices: many(tNotices),
    tPosts: many(tPosts),
    tInquiries_answeredBy: many(tInquiries, {
        relationName: "tInquiries_answeredBy_tUser_id"
    }),
    tInquiries_userId: many(tInquiries, {
        relationName: "tInquiries_userId_tUser_id"
    }),
    tInquiryReplies: many(tInquiryReplies),
    tFiles: many(tFiles),
    tUserRoles: many(tUserRoles),
}));
export const tFilesRelations = relations(tFiles, ({ one, many }) => ({
    tCourses: many(tCourses),
    tUser: one(tUser, {
        fields: [tFiles.uploadedBy],
        references: [tUser.id]
    }),
    tFileLinks: many(tFileLinks),
}));
export const tEnrollmentsRelations = relations(tEnrollments, ({ one, many }) => ({
    tCourse: one(tCourses, {
        fields: [tEnrollments.courseId],
        references: [tCourses.id]
    }),
    tCourseSession: one(tCourseSessions, {
        fields: [tEnrollments.sessionId],
        references: [tCourseSessions.id]
    }),
    tUser: one(tUser, {
        fields: [tEnrollments.userId],
        references: [tUser.id]
    }),
    tApplies: many(tApply),
}));
export const tApplyRelations = relations(tApply, ({ one }) => ({
    tEnrollment: one(tEnrollments, {
        fields: [tApply.enrollmentId],
        references: [tEnrollments.id]
    }),
    tCourseSession: one(tCourseSessions, {
        fields: [tApply.sessionId],
        references: [tCourseSessions.id]
    }),
    tUser: one(tUser, {
        fields: [tApply.userId],
        references: [tUser.id]
    }),
}));
export const tNoticesRelations = relations(tNotices, ({ one }) => ({
    tUser: one(tUser, {
        fields: [tNotices.authorId],
        references: [tUser.id]
    }),
}));
export const tPostsRelations = relations(tPosts, ({ one }) => ({
    tUser: one(tUser, {
        fields: [tPosts.authorId],
        references: [tUser.id]
    }),
}));
export const tTest1ChildRelations = relations(tTest1Child, ({ one }) => ({
    tTest1: one(tTest1, {
        fields: [tTest1Child.test1Id],
        references: [tTest1.id]
    }),
}));
export const tTest1Relations = relations(tTest1, ({ many }) => ({
    tTest1Children: many(tTest1Child),
}));
export const tInquiriesRelations = relations(tInquiries, ({ one, many }) => ({
    tUser_answeredBy: one(tUser, {
        fields: [tInquiries.answeredBy],
        references: [tUser.id],
        relationName: "tInquiries_answeredBy_tUser_id"
    }),
    tUser_userId: one(tUser, {
        fields: [tInquiries.userId],
        references: [tUser.id],
        relationName: "tInquiries_userId_tUser_id"
    }),
    tInquiryReplies: many(tInquiryReplies),
}));
export const tInquiryRepliesRelations = relations(tInquiryReplies, ({ one }) => ({
    tInquiry: one(tInquiries, {
        fields: [tInquiryReplies.inquiryId],
        references: [tInquiries.id]
    }),
    tUser: one(tUser, {
        fields: [tInquiryReplies.userId],
        references: [tUser.id]
    }),
}));
export const tFileLinksRelations = relations(tFileLinks, ({ one }) => ({
    tFile: one(tFiles, {
        fields: [tFileLinks.fileId],
        references: [tFiles.id]
    }),
}));
export const tUserRolesRelations = relations(tUserRoles, ({ one }) => ({
    tUser: one(tUser, {
        fields: [tUserRoles.userId],
        references: [tUser.id]
    }),
}));
