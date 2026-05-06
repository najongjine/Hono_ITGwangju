import { eq } from "drizzle-orm";
import path from "path";
import { db } from "../db/index.js";
import { tFiles } from "../db/schema.js";
export const getLocalDbFileByStorageKey = async (storageKey) => {
    const rows = await db
        .select()
        .from(tFiles)
        .where(eq(tFiles.storageKey, storageKey))
        .limit(1);
    return rows[0] ?? null;
};
export const insertLocalFileMeta = async (file) => {
    const rows = await db
        .insert(tFiles)
        .values({
        originalName: file.originalName,
        storedName: file.storedName,
        storageType: "local",
        filePath: file.filePath,
        bucket: "",
        storageKey: file.storageKey,
        publicUrl: "",
        mimeType: file.mimeType,
        fileSize: file.fileSize,
    })
        .returning();
    return rows[0] ?? null;
};
export const upsertLocalFileMeta = async (file) => {
    const existing = await getLocalDbFileByStorageKey(file.storageKey);
    if (!existing) {
        return insertLocalFileMeta(file);
    }
    const rows = await db
        .update(tFiles)
        .set({
        originalName: file.originalName,
        storedName: file.storedName,
        storageType: "local",
        filePath: file.filePath,
        bucket: "",
        publicUrl: "",
        mimeType: file.mimeType,
        fileSize: file.fileSize,
    })
        .where(eq(tFiles.id, existing.id))
        .returning();
    return rows[0] ?? null;
};
export const moveLocalFileMeta = async (sourceKey, file) => {
    const existing = await getLocalDbFileByStorageKey(sourceKey);
    if (!existing) {
        return insertLocalFileMeta({
            originalName: path.basename(file.key),
            storedName: path.basename(file.key),
            storageKey: file.key,
            filePath: file.path,
            mimeType: file.contentType,
            fileSize: file.size,
        });
    }
    const rows = await db
        .update(tFiles)
        .set({
        storedName: path.basename(file.key),
        filePath: file.path,
        storageKey: file.key,
        mimeType: file.contentType,
        fileSize: file.size,
    })
        .where(eq(tFiles.id, existing.id))
        .returning();
    return rows[0] ?? null;
};
export const deleteLocalFileMetaByStorageKey = async (storageKey) => {
    await db.delete(tFiles).where(eq(tFiles.storageKey, storageKey));
};
export const withLocalDbFile = async (file) => ({
    ...file,
    url: `/api/file/files/download?key=${encodeURIComponent(file.key)}`,
    dbFile: await getLocalDbFileByStorageKey(file.key),
});
