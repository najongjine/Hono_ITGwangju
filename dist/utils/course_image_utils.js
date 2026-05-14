import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { tFileLinks, tFiles } from "../db/schema.js";
import { insertLocalFileMeta } from "../routes/file_router_query.js";
import { readLocalFile, uploadLocalFile } from "./local_file_crud.js";
import { createSignedDownloadUrl, getStorageBucket, uploadFileAndCreateSignedUrl, } from "./supabase_file_crud.js";
import { convertImageToWebp, isImageMimeType } from "./utils.js";
const COURSE_TABLE = "t_courses";
const DESCRIPTION_IMAGE_ROLE = "description_image";
const useSupabaseStorage = () => {
    if (process.env.USE_LOCAL_STORAGE === "true") {
        return false;
    }
    return (process.env.NODE_ENV === "production" ||
        Boolean(process.env.STORAGE_ENDPOINT ?? process.env.STORAGE_Endpoint));
};
const buildImageUrl = (path, baseUrl = "") => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    return normalizedBaseUrl
        ? `${normalizedBaseUrl}${normalizedPath}`
        : normalizedPath;
};
const makeStorageKey = (dir, fileName) => {
    const safeDir = dir
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .split("/")
        .filter(Boolean)
        .join("/");
    const ext = path.extname(fileName);
    const storedName = `${uuidv4()}${ext}`;
    return {
        key: safeDir ? `${safeDir}/${storedName}` : storedName,
        storedName,
    };
};
const insertSupabaseFileMeta = async (file) => {
    const rows = await db
        .insert(tFiles)
        .values({
        originalName: file.originalName,
        storedName: file.storedName,
        storageType: "supabase",
        filePath: "",
        bucket: getStorageBucket(),
        storageKey: file.storageKey,
        publicUrl: "",
        mimeType: file.mimeType,
        fileSize: file.fileSize,
    })
        .returning();
    return rows[0] ?? null;
};
export const uploadCourseImage = async (file, dir) => {
    const originalName = file.name;
    const originalBody = Buffer.from(await file.arrayBuffer());
    const uploadBody = isImageMimeType(file.type)
        ? await convertImageToWebp(originalBody, originalName, file.type)
        : {
            buffer: originalBody,
            mimeType: file.type || "application/octet-stream",
            size: originalBody.length,
            storedName: originalName,
        };
    if (useSupabaseStorage()) {
        const storageKey = makeStorageKey(dir, uploadBody.storedName);
        const uploaded = await uploadFileAndCreateSignedUrl({
            key: storageKey.key,
            body: uploadBody.buffer,
            contentType: uploadBody.mimeType,
            metadata: {
                original_name: encodeURIComponent(originalName),
                stored_name: encodeURIComponent(storageKey.storedName),
            },
        });
        const dbFile = await insertSupabaseFileMeta({
            originalName,
            storedName: storageKey.storedName,
            storageKey: uploaded.file.key,
            mimeType: uploaded.file.contentType ?? uploadBody.mimeType,
            fileSize: uploaded.file.size ?? uploadBody.size,
        });
        return dbFile;
    }
    const uploaded = await uploadLocalFile({
        dir,
        originalName,
        storedName: uploadBody.storedName,
        body: uploadBody.buffer,
        contentType: uploadBody.mimeType,
    });
    return insertLocalFileMeta({
        originalName,
        storedName: uploaded.storedName,
        storageKey: uploaded.key,
        filePath: uploaded.path,
        mimeType: uploaded.contentType,
        fileSize: uploaded.size,
    });
};
export const withCourseFileUrl = (file, baseUrl = "") => {
    if (!file) {
        return null;
    }
    const storageKey = file.storageKey ?? "";
    const url = storageKey
        ? buildImageUrl(`/api/courses/images/${file.id}`, baseUrl)
        : "";
    return {
        ...file,
        url,
    };
};
export const getCourseImageResponse = async (fileId) => {
    const rows = await db.select().from(tFiles).where(eq(tFiles.id, fileId)).limit(1);
    const file = rows[0];
    if (!file) {
        throw new Error("image file not found");
    }
    const storageKey = file.storageKey ?? "";
    if (!storageKey) {
        throw new Error("image storage key is empty");
    }
    if (file.storageType === "supabase") {
        return Response.redirect(await createSignedDownloadUrl(storageKey, 60 * 10));
    }
    const localFile = await readLocalFile(storageKey);
    return new Response(localFile.body, {
        headers: {
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(localFile.key))}"`,
            "Content-Length": String(localFile.size),
            "Content-Type": localFile.contentType,
        },
    });
};
export const getCourseImageRows = async (courseId, thumbnailFileId, baseUrl = "") => {
    const thumbnailRows = thumbnailFileId
        ? await db.select().from(tFiles).where(eq(tFiles.id, thumbnailFileId)).limit(1)
        : [];
    const descriptionRows = await db
        .select({
        link: tFileLinks,
        file: tFiles,
    })
        .from(tFileLinks)
        .innerJoin(tFiles, eq(tFileLinks.fileId, tFiles.id))
        .where(and(eq(tFileLinks.targetTable, COURSE_TABLE), eq(tFileLinks.targetId, courseId), eq(tFileLinks.fileRole, DESCRIPTION_IMAGE_ROLE)))
        .orderBy(asc(tFileLinks.sortOrder), asc(tFileLinks.id));
    return {
        thumbnail: withCourseFileUrl(thumbnailRows[0] ?? null, baseUrl),
        descriptionImages: descriptionRows.map(({ link, file }) => ({
            link,
            file: withCourseFileUrl(file, baseUrl),
        })),
    };
};
