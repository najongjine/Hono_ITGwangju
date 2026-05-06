import { relations } from "drizzle-orm";
import { bigint, integer, pgTable, timestamp, varchar, } from "drizzle-orm/pg-core";
export const tTest1 = pgTable("t_test1", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: varchar("title").default(""),
    content: varchar("content").default(""),
    createdDt: timestamp("created_dt", { withTimezone: true }).defaultNow(),
});
export const tTest1Child = pgTable("t_test1_child", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    comment: varchar("comment").default(""),
    createdDt: timestamp("created_dt", { withTimezone: true }).defaultNow(),
    test1Id: integer("test1_id").references(() => tTest1.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
    }),
});
export const tFiles = pgTable("t_files", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    originalName: varchar("original_name").default(""),
    storedName: varchar("stored_name").default(""),
    storageType: varchar("storage_type").default("local"),
    filePath: varchar("file_path").default(""),
    bucket: varchar("bucket").default(""),
    storageKey: varchar("storage_key").default(""),
    publicUrl: varchar("public_url").default(""),
    mimeType: varchar("mime_type").default(""),
    fileSize: bigint("file_size", { mode: "number" }).default(0),
    createdAt: timestamp("created_at").defaultNow(),
});
export const tTest1Relations = relations(tTest1, ({ many }) => ({
    tTest1Children: many(tTest1Child),
}));
export const tTest1ChildRelations = relations(tTest1Child, ({ one }) => ({
    test1: one(tTest1, {
        fields: [tTest1Child.test1Id],
        references: [tTest1.id],
    }),
}));
