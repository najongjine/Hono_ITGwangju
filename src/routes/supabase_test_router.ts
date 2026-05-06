import { Hono } from "hono";
import { eq } from "drizzle-orm";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { tFiles } from "../db/schema.js";
import {
  copyFile,
  createSignedDownloadUrl,
  createSignedUploadUrl,
  deleteFile,
  getFileInfo,
  getStorageBucket,
  listFiles,
  moveFile,
  uploadFileAndCreateSignedUrl,
} from "../utils/supabase_file_crud.js";
import { convertImageToWebp, isImageMimeType } from "../utils/utils.js";

const router = new Hono();

const ok = (data: unknown = null, message = "") => ({
  success: true,
  data,
  code: "",
  message,
});

const fail = (error: unknown) => ({
  success: false,
  data: null,
  code: "",
  message: `error. ${error instanceof Error ? error.message : String(error)}`,
});

const toPositiveInt = (
  value: FormDataEntryValue | string | null,
  fallback: number
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

  return safeDir ? `${safeDir}/${storedName}` : storedName;
};

const getDbFileByStorageKey = async (storageKey: string) => {
  const rows = await db
    .select()
    .from(tFiles)
    .where(eq(tFiles.storageKey, storageKey))
    .limit(1);

  return rows[0] ?? null;
};

const insertSupabaseFileMeta = async (file: {
  originalName: string;
  storedName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
}) => {
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

const upsertSupabaseFileMeta = async (file: {
  originalName: string;
  storedName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
}) => {
  const existing = await getDbFileByStorageKey(file.storageKey);
  if (!existing) {
    return insertSupabaseFileMeta(file);
  }

  const rows = await db
    .update(tFiles)
    .set({
      originalName: file.originalName,
      storedName: file.storedName,
      storageType: "supabase",
      filePath: "",
      bucket: getStorageBucket(),
      publicUrl: "",
      mimeType: file.mimeType,
      fileSize: file.fileSize,
    })
    .where(eq(tFiles.id, existing.id))
    .returning();

  return rows[0] ?? null;
};

router.get("/files", async (c) => {
  try {
    const prefix = String(c.req.query("prefix") ?? "");
    const maxKeys = toPositiveInt(c.req.query("maxKeys") ?? null, 100);
    const files = await listFiles(prefix, maxKeys);
    const dbFiles = await db.select().from(tFiles);
    const dbFileMap = new Map(
      dbFiles.map((file) => [file.storageKey ?? "", file])
    );

    return c.json(
      ok(
        files.map((file) => ({
          ...file,
          dbFile: dbFileMap.get(file.key) ?? null,
        }))
      )
    );
  } catch (error) {
    return c.json(fail(error));
  }
});

router.post("/files", async (c) => {
  try {
    const form = await c.req.formData();
    const dir = String(form.get("dir") ?? "uploads");
    const expiresIn = toPositiveInt(form.get("expiresIn"), 60 * 10);
    const files = form.getAll("files");

    if (files.length === 0) {
      return c.json(fail(new Error("files field is required")));
    }

    const uploadedFiles = [];
    for (const item of files) {
      if (!(item instanceof File)) {
        continue;
      }

      const originalName = item.name;
      const originalBody = Buffer.from(await item.arrayBuffer());
      const uploadBody = isImageMimeType(item.type)
        ? await convertImageToWebp(originalBody, originalName, item.type)
        : {
            buffer: originalBody,
            mimeType: item.type || "application/octet-stream",
            size: originalBody.length,
            storedName: originalName,
          };
      const key = makeStorageKey(dir, uploadBody.storedName);
      const uploaded = await uploadFileAndCreateSignedUrl(
        {
          key,
          body: uploadBody.buffer,
          contentType: uploadBody.mimeType,
          metadata: {
            original_name: encodeURIComponent(originalName),
            stored_name: encodeURIComponent(uploadBody.storedName),
          },
        },
        expiresIn
      );
      const dbFile = await insertSupabaseFileMeta({
        originalName,
        storedName: uploadBody.storedName,
        storageKey: uploaded.file.key,
        mimeType: uploaded.file.contentType ?? uploadBody.mimeType,
        fileSize: uploaded.file.size ?? uploadBody.size,
      });

      uploadedFiles.push({
        id: dbFile?.id,
        originalName,
        storedName: uploadBody.storedName,
        key: uploaded.file.key,
        url: uploaded.signedUrl,
        expiresIn: uploaded.expiresIn,
        size: uploaded.file.size ?? uploadBody.size,
        contentType: uploaded.file.contentType ?? uploadBody.mimeType,
        lastModified: uploaded.file.lastModified,
        dbFile,
      });
    }

    return c.json(ok(uploadedFiles));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.get("/files/info", async (c) => {
  try {
    const key = String(c.req.query("key") ?? "");
    const expiresIn = toPositiveInt(c.req.query("expiresIn") ?? null, 60 * 10);

    if (!key) {
      return c.json(fail(new Error("key query is required")));
    }

    const file = await getFileInfo(key);
    const url = await createSignedDownloadUrl(file.key, expiresIn);
    const dbFile = await getDbFileByStorageKey(file.key);

    return c.json(
      ok({
        ...file,
        url,
        expiresIn,
        dbFile,
      })
    );
  } catch (error) {
    return c.json(fail(error));
  }
});

router.get("/files/read-url", async (c) => {
  try {
    const key = String(c.req.query("key") ?? "");
    const expiresIn = toPositiveInt(c.req.query("expiresIn") ?? null, 60 * 10);

    if (!key) {
      return c.json(fail(new Error("key query is required")));
    }

    const url = await createSignedDownloadUrl(key, expiresIn);
    const dbFile = await getDbFileByStorageKey(key);

    return c.json(
      ok({
        key,
        url,
        expiresIn,
        dbFile,
      })
    );
  } catch (error) {
    return c.json(fail(error));
  }
});

router.post("/files/signed-upload-url", async (c) => {
  try {
    const body = await c.req.json<{
      key?: string;
      contentType?: string;
      expiresIn?: number;
    }>();
    const key = String(body.key ?? "");
    const expiresIn = toPositiveInt(String(body.expiresIn ?? ""), 60 * 10);

    if (!key) {
      return c.json(fail(new Error("key is required")));
    }

    if (body.contentType && isImageMimeType(body.contentType)) {
      return c.json(
        fail(
          new Error(
            "image uploads must use POST /files so the server can convert them to webp"
          )
        )
      );
    }

    const url = await createSignedUploadUrl(key, expiresIn, body.contentType);

    return c.json(
      ok({
        key,
        url,
        expiresIn,
      })
    );
  } catch (error) {
    return c.json(fail(error));
  }
});

router.put("/files", async (c) => {
  try {
    const form = await c.req.formData();
    const key = String(form.get("key") ?? "");
    const file = form.get("file");
    const expiresIn = toPositiveInt(form.get("expiresIn"), 60 * 10);

    if (!key) {
      return c.json(fail(new Error("key field is required")));
    }

    if (!(file instanceof File)) {
      return c.json(fail(new Error("file field is required")));
    }

    const originalBody = Buffer.from(await file.arrayBuffer());
    const uploadBody = isImageMimeType(file.type)
      ? await convertImageToWebp(originalBody, file.name, file.type)
      : {
          buffer: originalBody,
          mimeType: file.type || "application/octet-stream",
          size: originalBody.length,
          storedName: file.name,
        };
    const uploadKey = isImageMimeType(file.type)
      ? key.replace(/\.[^/.]+$/, ".webp")
      : key;

    const uploaded = await uploadFileAndCreateSignedUrl(
      {
        key: uploadKey,
        body: uploadBody.buffer,
        contentType: uploadBody.mimeType,
        metadata: {
          original_name: encodeURIComponent(file.name),
          stored_name: encodeURIComponent(uploadBody.storedName),
        },
      },
      expiresIn
    );
    const dbFile = await upsertSupabaseFileMeta({
      originalName: file.name,
      storedName: uploadBody.storedName,
      storageKey: uploaded.file.key,
      mimeType: uploaded.file.contentType ?? uploadBody.mimeType,
      fileSize: uploaded.file.size ?? uploadBody.size,
    });

    return c.json(
      ok({
        id: dbFile?.id,
        key: uploaded.file.key,
        originalName: file.name,
        storedName: uploadBody.storedName,
        url: uploaded.signedUrl,
        expiresIn: uploaded.expiresIn,
        size: uploaded.file.size ?? uploadBody.size,
        contentType: uploaded.file.contentType ?? uploadBody.mimeType,
        lastModified: uploaded.file.lastModified,
        dbFile,
      })
    );
  } catch (error) {
    return c.json(fail(error));
  }
});

router.post("/files/copy", async (c) => {
  try {
    const body = await c.req.json<{
      sourceKey?: string;
      destinationKey?: string;
      expiresIn?: number;
    }>();
    const sourceKey = String(body.sourceKey ?? "");
    const destinationKey = String(body.destinationKey ?? "");
    const expiresIn = toPositiveInt(String(body.expiresIn ?? ""), 60 * 10);

    if (!sourceKey || !destinationKey) {
      return c.json(
        fail(new Error("sourceKey and destinationKey are required"))
      );
    }

    const file = await copyFile(sourceKey, destinationKey);
    const url = await createSignedDownloadUrl(file.key, expiresIn);
    const sourceDbFile = await getDbFileByStorageKey(sourceKey);
    const dbFile = await insertSupabaseFileMeta({
      originalName: sourceDbFile?.originalName ?? path.basename(destinationKey),
      storedName: path.basename(destinationKey),
      storageKey: file.key,
      mimeType: file.contentType ?? sourceDbFile?.mimeType ?? "",
      fileSize: file.size ?? sourceDbFile?.fileSize ?? 0,
    });

    return c.json(
      ok({
        ...file,
        url,
        expiresIn,
        dbFile,
      })
    );
  } catch (error) {
    return c.json(fail(error));
  }
});

router.post("/files/move", async (c) => {
  try {
    const body = await c.req.json<{
      sourceKey?: string;
      destinationKey?: string;
      expiresIn?: number;
    }>();
    const sourceKey = String(body.sourceKey ?? "");
    const destinationKey = String(body.destinationKey ?? "");
    const expiresIn = toPositiveInt(String(body.expiresIn ?? ""), 60 * 10);

    if (!sourceKey || !destinationKey) {
      return c.json(
        fail(new Error("sourceKey and destinationKey are required"))
      );
    }

    const file = await moveFile(sourceKey, destinationKey);
    const url = await createSignedDownloadUrl(file.key, expiresIn);
    const existing = await getDbFileByStorageKey(sourceKey);
    const dbFile = existing
      ? (
          await db
            .update(tFiles)
            .set({
              storedName: path.basename(destinationKey),
              bucket: getStorageBucket(),
              storageKey: file.key,
              mimeType: file.contentType ?? existing.mimeType ?? "",
              fileSize: file.size ?? existing.fileSize ?? 0,
            })
            .where(eq(tFiles.id, existing.id))
            .returning()
        )[0] ?? null
      : await insertSupabaseFileMeta({
          originalName: path.basename(destinationKey),
          storedName: path.basename(destinationKey),
          storageKey: file.key,
          mimeType: file.contentType ?? "",
          fileSize: file.size ?? 0,
        });

    return c.json(
      ok({
        ...file,
        url,
        expiresIn,
        dbFile,
      })
    );
  } catch (error) {
    return c.json(fail(error));
  }
});

router.delete("/files", async (c) => {
  try {
    const key = String(c.req.query("key") ?? "");

    if (!key) {
      return c.json(fail(new Error("key query is required")));
    }

    const deleted = await deleteFile(key);
    await db.delete(tFiles).where(eq(tFiles.storageKey, key));

    return c.json(ok(deleted));
  } catch (error) {
    return c.json(fail(error));
  }
});

export default router;
