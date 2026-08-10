import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { tFileLinks, tFiles } from "../db/schema.js";
import { insertLocalFileMeta } from "../routes/file_router_query.js";
import { readLocalFile, uploadLocalFile } from "./local_file_crud.js";
import {
  getCloudinaryCloudName,
  uploadCloudinaryFile,
} from "./cloudinary_file_crud.js";
import { convertImageToWebp, isImageMimeType } from "./utils.js";

const COURSE_TABLE = "t_courses";
const DESCRIPTION_IMAGE_ROLE = "description_image";

export type CourseImageFile = typeof tFiles.$inferSelect;

const useCloudinaryStorage = () => process.env.NODE_ENV !== "production";

const buildImageUrl = (path: string, baseUrl = "") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

  return normalizedBaseUrl
    ? `${normalizedBaseUrl}${normalizedPath}`
    : normalizedPath;
};

const makeStorageKey = (dir: string, fileName: string) => {
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

const insertCloudinaryFileMeta = async (file: {
  originalName: string;
  storedName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  publicUrl: string;
}) => {
  const rows = await db
    .insert(tFiles)
    .values({
      originalName: file.originalName,
      storedName: file.storedName,
      storageType: "cloudinary",
      filePath: "",
      bucket: getCloudinaryCloudName(),
      storageKey: file.storageKey,
      publicUrl: file.publicUrl,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
    })
    .returning();

  return rows[0] ?? null;
};

export const uploadCourseImage = async (file: File, dir: string) => {
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

  if (useCloudinaryStorage()) {
    const storageKey = makeStorageKey(dir, uploadBody.storedName);
    const uploaded = await uploadCloudinaryFile({
      key: storageKey.key,
      body: uploadBody.buffer,
      contentType: uploadBody.mimeType,
      metadata: {
        original_name: encodeURIComponent(originalName),
        stored_name: encodeURIComponent(storageKey.storedName),
      },
    });
    const dbFile = await insertCloudinaryFileMeta({
      originalName,
      storedName: storageKey.storedName,
      storageKey: uploaded.key,
      publicUrl: uploaded.url,
      mimeType: uploaded.contentType,
      fileSize: uploaded.size,
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

export const withCourseFileUrl = (
  file: CourseImageFile | null,
  baseUrl = ""
) => {
  if (!file) {
    return null;
  }

  const storageKey = file.storageKey ?? "";
  const url = storageKey
    ? buildImageUrl(`/api/files?file_id=${file.id}`, baseUrl)
    : "";

  return {
    ...file,
    url,
  };
};

export const getStoredFileResponse = async (fileId: number) => {
  const rows = await db.select().from(tFiles).where(eq(tFiles.id, fileId)).limit(1);
  const file = rows[0];
  if (!file) {
    throw new Error("file not found");
  }

  const storageKey = file.storageKey ?? "";
  if (!storageKey) {
    throw new Error("file storage key is empty");
  }

  if (file.storageType === "cloudinary") {
    if (!file.publicUrl) {
      throw new Error("Cloudinary public URL is empty");
    }
    return Response.redirect(file.publicUrl);
  }

  const localFile = await readLocalFile(storageKey);

  return new Response(localFile.body, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename="${encodeURIComponent(
        path.basename(localFile.key)
      )}"`,
      "Content-Length": String(localFile.size),
      "Content-Type": localFile.contentType,
    },
  });
};


export const getCourseImageRows = async (
  courseId: number,
  thumbnailFileId: number | null,
  baseUrl = ""
) => {
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
    .where(
      and(
        eq(tFileLinks.targetTable, COURSE_TABLE),
        eq(tFileLinks.targetId, courseId),
        eq(tFileLinks.fileRole, DESCRIPTION_IMAGE_ROLE)
      )
    )
    .orderBy(asc(tFileLinks.sortOrder), asc(tFileLinks.id));

  return {
    thumbnail: withCourseFileUrl(thumbnailRows[0] ?? null, baseUrl),
    descriptionImages: descriptionRows.map(({ link, file }) => ({
        link,
        file: withCourseFileUrl(file, baseUrl),
      })),
  };
};
