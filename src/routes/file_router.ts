import { Hono } from "hono";
import path from "path";
import {
  deleteLocalFileMetaByStorageKey,
  getLocalDbFileByStorageKey,
  insertLocalFileMeta,
  moveLocalFileMeta,
  upsertLocalFileMeta,
  withLocalDbFile,
} from "./file_router_query.js";
import {
  copyLocalFile,
  deleteLocalFile,
  getLocalFileInfo,
  getLocalUploadRoot,
  listLocalFiles,
  moveLocalFile,
  normalizeLocalKey,
  readLocalFile,
  replaceLocalFile,
  uploadLocalFile,
} from "../utils/local_file_crud.js";
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

router.get("/files", async (c) => {
  try {
    const prefix = String(c.req.query("prefix") ?? "");
    const files = await listLocalFiles(prefix);

    return c.json(ok(await Promise.all(files.map(withLocalDbFile))));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.post("/files", async (c) => {
  try {
    const form = await c.req.formData();
    const dir = String(form.get("dir") ?? "uploads");
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
      const file = await uploadLocalFile({
        dir,
        originalName,
        storedName: uploadBody.storedName,
        body: uploadBody.buffer,
        contentType: uploadBody.mimeType,
      });
      const dbFile = await insertLocalFileMeta({
        originalName,
        storedName: file.storedName,
        storageKey: file.key,
        filePath: file.path,
        mimeType: file.contentType,
        fileSize: file.size,
      });

      uploadedFiles.push({
        ...file,
        id: dbFile?.id,
        url: `/api/file/files/download?key=${encodeURIComponent(file.key)}`,
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

    if (!key) {
      return c.json(fail(new Error("key query is required")));
    }

    const file = await getLocalFileInfo(key);
    return c.json(ok(await withLocalDbFile(file)));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.get("/files/download", async (c) => {
  try {
    const key = String(c.req.query("key") ?? "");

    if (!key) {
      return c.json(fail(new Error("key query is required")));
    }

    const file = await readLocalFile(key);

    return new Response(file.body, {
      headers: {
        "Content-Disposition": `inline; filename="${encodeURIComponent(
          path.basename(file.key)
        )}"`,
        "Content-Length": String(file.size),
        "Content-Type": file.contentType,
      },
    });
  } catch (error) {
    return c.json(fail(error));
  }
});

router.put("/files", async (c) => {
  try {
    const form = await c.req.formData();
    const key = String(form.get("key") ?? "");
    const file = form.get("file");

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
    const replaceKey = isImageMimeType(file.type)
      ? normalizeLocalKey(key).replace(/\.[^/.]+$/, ".webp")
      : key;
    const updated = await replaceLocalFile({
      key: replaceKey,
      originalName: file.name,
      body: uploadBody.buffer,
      contentType: uploadBody.mimeType,
    });
    const dbFile = await upsertLocalFileMeta({
      originalName: file.name,
      storedName: updated.storedName,
      storageKey: updated.key,
      filePath: updated.path,
      mimeType: updated.contentType,
      fileSize: updated.size,
    });

    return c.json(
      ok({
        ...updated,
        id: dbFile?.id,
        url: `/api/file/files/download?key=${encodeURIComponent(updated.key)}`,
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
    }>();
    const sourceKey = String(body.sourceKey ?? "");
    const destinationKey = String(body.destinationKey ?? "");

    if (!sourceKey || !destinationKey) {
      return c.json(
        fail(new Error("sourceKey and destinationKey are required"))
      );
    }

    const file = await copyLocalFile(sourceKey, destinationKey);
    const sourceDbFile = await getLocalDbFileByStorageKey(sourceKey);
    const dbFile = await insertLocalFileMeta({
      originalName: sourceDbFile?.originalName ?? path.basename(destinationKey),
      storedName: path.basename(file.key),
      storageKey: file.key,
      filePath: file.path,
      mimeType: file.contentType,
      fileSize: file.size,
    });

    return c.json(
      ok({
        ...(await withLocalDbFile(file)),
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
    }>();
    const sourceKey = String(body.sourceKey ?? "");
    const destinationKey = String(body.destinationKey ?? "");

    if (!sourceKey || !destinationKey) {
      return c.json(
        fail(new Error("sourceKey and destinationKey are required"))
      );
    }

    const file = await moveLocalFile(sourceKey, destinationKey);
    const dbFile = await moveLocalFileMeta(sourceKey, file);

    return c.json(
      ok({
        ...file,
        url: `/api/file/files/download?key=${encodeURIComponent(file.key)}`,
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

    const deleted = await deleteLocalFile(key);
    await deleteLocalFileMetaByStorageKey(key);

    return c.json(ok(deleted));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.get("/root", (c) => {
  return c.json(ok({ root: getLocalUploadRoot() }));
});

export default router;
