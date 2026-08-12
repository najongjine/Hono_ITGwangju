import { relations } from "drizzle-orm/relations";
import { tCourses, tCourseSessions, tUser, tUserRegistermeta, tFiles, tEnrollments, tNotices, tTest1, tTest1Child, tInquiries, tFileLinks, tUserRoles, tInquiryReplies, tBanner } from "./schema.js";
export const tCourseSessionsRelations = relations(tCourseSessions, ({ one, many }) => ({
    tCourse: one(tCourses, {
        fields: [tCourseSessions.courseId],
        references: [tCourses.id]
    }),
    tEnrollments: many(tEnrollments),
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
    tNotices: many(tNotices),
    tInquiries_userId: many(tInquiries, {
        relationName: "tInquiries_userId_tUser_id"
    }),
    tFiles: many(tFiles),
    tUserRoles: many(tUserRoles),
    tUserRegistermeta: many(tUserRegistermeta),
    tInquiryReplies: many(tInquiryReplies),
    tBanners_createdBy: many(tBanner, {
        relationName: "tBanner_createdBy_tUser_id"
    }),
    tBanners_updatedBy: many(tBanner, {
        relationName: "tBanner_updatedBy_tUser_id"
    }),
}));
export const tUserRegistermetaRelations = relations(tUserRegistermeta, ({ one }) => ({
    tUser: one(tUser, {
        fields: [tUserRegistermeta.userId],
        references: [tUser.id]
    }),
}));
export const tFilesRelations = relations(tFiles, ({ one, many }) => ({
    tCourses: many(tCourses),
    tUser: one(tUser, {
        fields: [tFiles.uploadedBy],
        references: [tUser.id]
    }),
    tFileLinks: many(tFileLinks),
    tBanners: many(tBanner),
}));
export const tEnrollmentsRelations = relations(tEnrollments, ({ one }) => ({
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
}));
export const tNoticesRelations = relations(tNotices, ({ one }) => ({
    tUser: one(tUser, {
        fields: [tNotices.userId],
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
    tUser_userId: one(tUser, {
        fields: [tInquiries.userId],
        references: [tUser.id],
        relationName: "tInquiries_userId_tUser_id"
    }),
    tInquiryReplies: many(tInquiryReplies),
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
export const tBannerRelations = relations(tBanner, ({ one }) => ({
    tUser_createdBy: one(tUser, {
        fields: [tBanner.createdBy],
        references: [tUser.id],
        relationName: "tBanner_createdBy_tUser_id"
    }),
    tFile: one(tFiles, {
        fields: [tBanner.imageFileId],
        references: [tFiles.id]
    }),
    tUser_updatedBy: one(tUser, {
        fields: [tBanner.updatedBy],
        references: [tUser.id],
        relationName: "tBanner_updatedBy_tUser_id"
    }),
}));
