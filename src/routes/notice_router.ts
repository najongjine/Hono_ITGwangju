import { Hono, type Context } from "hono";
import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { tFileLinks, tFiles, tNotices } from "../db/schema.js";
import { isAdminUser, toSafeUser, verifyUserToken } from "../utils/auth_utils.js";
import { uploadLocalFile } from "../utils/local_file_crud.js";
import { convertImageToWebp, isImageMimeType } from "../utils/utils.js";

const router = new Hono();
const MODULE_NAME = "notice_router";
const NOTICE_TABLE = "t_notices";
const NOTICE_IMAGE_ROLE = "notice_image";
const NOTICE_IMAGE_ORDER_FIELDS = [
  "imageOrders",
  "imageOrder",
  "image_orders",
  "image_order",
  "noticeImageOrders",
  "notice_image_orders",
  "fileOrders",
  "file_orders",
  "sortOrders",
  "sort_orders",
];

const ok = (data: unknown = null, message = "") => ({
  success: true,
  data,
  code: "",
  msg: message,
});

const getApiName = (c: Context) => `${c.req.method} ${new URL(c.req.url).pathname}`;

const fail = (c: Context, error: unknown) => ({
  success: false,
  data: null,
  code: "",
  module: MODULE_NAME,
  api: getApiName(c),
  msg: error instanceof Error ? error.message : String(error),
});

const isTruthy = (value: unknown, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["true", "1", "y", "yes", "on"].includes(String(value).toLowerCase());
};

const readJson = async (c: Context) => {
  try {
    return await c.req.json<Record<string, unknown>>();
  } catch {
    return {};
  }
};

const readString = (
  input: Record<string, unknown> | FormData,
  names: string[],
  fallback = ""
) => {
  for (const name of names) {
    const value = input instanceof FormData ? input.get(name) : input[name];
    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return fallback;
};

const parseIntegerListValue = (value: unknown): number[] => {
  if (value === undefined || value === null || value instanceof File) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(parseIntegerListValue);
  }

  const text = String(value).trim();
  if (!text) {
    return [];
  }

  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      return parseIntegerListValue(JSON.parse(text));
    } catch {
      return [];
    }
  }

  return text
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.floor(item));
};

const readIntegerList = (
  input: Record<string, unknown> | FormData,
  names: string[]
) => {
  const values =
    input instanceof FormData
      ? names.flatMap((name) => input.getAll(name))
      : names.map((name) => input[name]);

  return values.flatMap(parseIntegerListValue);
};

const requireAdminUser = async (c: Context) => {
  const user = await verifyUserToken(c.req.header("authorization") ?? "");
  if (await isAdminUser(user)) {
    return user;
  }

  throw new Error("admin permission is required");
};

const getFormFiles = (form: FormData) =>
  [
    ...form.getAll("images"),
    ...form.getAll("image"),
    ...form.getAll("files"),
    ...form.getAll("attachments"),
  ].filter((item): item is File => item instanceof File && item.size > 0);

const uploadNoticeImage = async (file: File, uploadedBy: number | null) => {
  if (!isImageMimeType(file.type)) {
    throw new Error("notice images must be image files");
  }

  const originalBody = Buffer.from(await file.arrayBuffer());
  const uploadBody = await convertImageToWebp(originalBody, file.name, file.type);
  const uploaded = await uploadLocalFile({
    dir: "notices/images",
    originalName: file.name,
    storedName: uploadBody.storedName,
    body: uploadBody.buffer,
    contentType: uploadBody.mimeType,
  });

  const rows = await db
    .insert(tFiles)
    .values({
      originalName: file.name,
      storedName: uploaded.storedName,
      storageType: "local",
      filePath: uploaded.path,
      bucket: "",
      storageKey: uploaded.key,
      publicUrl: "",
      mimeType: uploaded.contentType,
      fileSize: uploaded.size,
      uploadedBy,
    })
    .returning();

  return rows[0];
};

const withFileUrl = (file: typeof tFiles.$inferSelect) => ({
  ...file,
  url: file.storageKey
    ? `/api/file/files/download?key=${encodeURIComponent(file.storageKey)}`
    : "",
});

const getNoticeImages = async (noticeId: number) => {
  const rows = await db
    .select({
      link: tFileLinks,
      file: tFiles,
    })
    .from(tFileLinks)
    .innerJoin(tFiles, eq(tFileLinks.fileId, tFiles.id))
    .where(
      and(
        eq(tFileLinks.targetTable, NOTICE_TABLE),
        eq(tFileLinks.targetId, noticeId),
        eq(tFileLinks.fileRole, NOTICE_IMAGE_ROLE),
        ne(tFiles.status, "deleted")
      )
    )
    .orderBy(tFileLinks.sortOrder, tFileLinks.id);

  return rows.map(({ link, file }) => ({
    ...link,
    file: withFileUrl(file),
  }));
};

const parseExistingImageIds = (
  input: Record<string, unknown> | FormData
) => {
  const raw =
    input instanceof FormData
      ? [...input.getAll("imageFileIds"), ...input.getAll("image_file_ids")]
      : [input.imageFileIds, input.image_file_ids];

  return raw
    .flatMap((value) =>
      Array.isArray(value) ? value : String(value ?? "").split(",")
    )
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
};

const saveNoticeImages = async (
  noticeId: number,
  files: File[],
  existingImageIds: number[],
  uploadedBy: number | null,
  imageOrders: number[] = []
) => {
  if (files.length === 0 && existingImageIds.length === 0) {
    return;
  }

  const uploadedImages = [];
  for (const file of files) {
    const uploaded = await uploadNoticeImage(file, uploadedBy);
    if (uploaded) {
      uploadedImages.push(uploaded);
    }
  }

  const fileIds = [
    ...existingImageIds,
    ...uploadedImages.map((file) => file.id),
  ];

  await db.transaction(async (tx) => {
    await tx
      .delete(tFileLinks)
      .where(
        and(
          eq(tFileLinks.targetTable, NOTICE_TABLE),
          eq(tFileLinks.targetId, noticeId),
          eq(tFileLinks.fileRole, NOTICE_IMAGE_ROLE)
        )
      );

    if (fileIds.length > 0) {
      await tx.insert(tFileLinks).values(
        fileIds.map((fileId, index) => ({
          fileId,
          targetTable: NOTICE_TABLE,
          targetId: noticeId,
          fileRole: NOTICE_IMAGE_ROLE,
          sortOrder: imageOrders[index] ?? index,
        }))
      );
    }
  });
};

const getInput = async (c: Context) => {
  const contentType = c.req.header("content-type") ?? "";
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    return c.req.formData();
  }

  return readJson(c);
};

router.get("/", async (c) => {
  try {
    const includeHidden = isTruthy(c.req.query("includeHidden"));
    if (includeHidden) {
      await requireAdminUser(c);
    }

    const q = String(c.req.query("q") ?? "").trim();
    const where = [
      includeHidden ? undefined : eq(tNotices.isVisible, true),
      ne(tNotices.status, "deleted"),
      q
        ? or(ilike(tNotices.title, `%${q}%`), ilike(tNotices.content, `%${q}%`))
        : undefined,
    ].filter(Boolean);

    const notices = await db
      .select()
      .from(tNotices)
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(desc(tNotices.isPinned), desc(tNotices.createdAt), desc(tNotices.id));

    const data = await Promise.all(
      notices.map(async (notice) => ({
        ...notice,
        images: await getNoticeImages(notice.id),
      }))
    );

    return c.json(ok(data));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.get("/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const rows = await db.select().from(tNotices).where(eq(tNotices.id, id)).limit(1);
    const notice = rows[0];
    if (!notice || notice.status === "deleted") {
      return c.json(fail(c, new Error("notice not found")));
    }
    if (!notice.isVisible) {
      await requireAdminUser(c);
    }

    const incrementView = !["false", "0", "n", "no", "off"].includes(
      String(c.req.query("incrementView") ?? "true").toLowerCase()
    );
    const saved = incrementView
      ? (
          await db
            .update(tNotices)
            .set({
              viewCount: sql`${tNotices.viewCount} + 1`,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(tNotices.id, id))
            .returning()
        )[0] ?? notice
      : notice;

    return c.json(ok({ ...saved, images: await getNoticeImages(saved.id) }));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.post("/", async (c) => {
  try {
    const admin = await requireAdminUser(c);
    const input = await getInput(c);
    const id = Number(readString(input, ["id"], "0"));
    const title = readString(input, ["title"]);
    const content = readString(input, ["content"]);
    const authorName =
      readString(input, ["authorName", "author_name"]) ||
      toSafeUser(admin).realName ||
      admin.email ||
      "";

    if (!Number.isFinite(id) || id < 0) {
      return c.json(fail(c, new Error("id must be 0 or a positive number")));
    }
    if (!title) {
      return c.json(fail(c, new Error("title is required")));
    }

    const existing =
      id > 0
        ? (
            await db
              .select({ id: tNotices.id })
              .from(tNotices)
              .where(eq(tNotices.id, id))
              .limit(1)
          )[0]
        : null;
    if (id > 0 && !existing) {
      return c.json(fail(c, new Error("notice not found")));
    }

    const now = new Date().toISOString();
    const status = readString(input, ["status"], "published");
    const publishedAt =
      readString(input, ["publishedAt", "published_at"]) ||
      (status === "published" ? now : null);
    const payload = {
      title,
      content,
      authorId: admin.id,
      authorName,
      isVisible: isTruthy(readString(input, ["isVisible", "is_visible"], ""), true),
      isPinned: isTruthy(readString(input, ["isPinned", "is_pinned"], ""), false),
      status,
      publishedAt,
    };

    const saved =
      id === 0
        ? (await db.insert(tNotices).values(payload).returning())[0]
        : (
            await db
              .update(tNotices)
              .set({ ...payload, updatedAt: now })
              .where(eq(tNotices.id, id))
              .returning()
          )[0];
    if (!saved) {
      return c.json(fail(c, new Error("failed to save notice")));
    }

    await saveNoticeImages(
      saved.id,
      input instanceof FormData ? getFormFiles(input) : [],
      parseExistingImageIds(input),
      admin.id,
      readIntegerList(input, NOTICE_IMAGE_ORDER_FIELDS)
    );

    return c.json(ok({ ...saved, images: await getNoticeImages(saved.id) }));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.put("/:id", async (c) => {
  try {
    const admin = await requireAdminUser(c);
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const input = await getInput(c);
    const existing = (
      await db.select().from(tNotices).where(eq(tNotices.id, id)).limit(1)
    )[0];
    if (!existing || existing.status === "deleted") {
      return c.json(fail(c, new Error("notice not found")));
    }

    const title = readString(input, ["title"], existing.title);
    if (!title) {
      return c.json(fail(c, new Error("title is required")));
    }

    const now = new Date().toISOString();
    const saved = (
      await db
        .update(tNotices)
        .set({
          title,
          content: readString(input, ["content"], existing.content ?? ""),
          authorId: admin.id,
          authorName:
            readString(input, ["authorName", "author_name"], existing.authorName ?? "") ||
            toSafeUser(admin).realName ||
            admin.email ||
            "",
          isVisible: isTruthy(
            readString(input, ["isVisible", "is_visible"], String(existing.isVisible)),
            existing.isVisible ?? true
          ),
          isPinned: isTruthy(
            readString(input, ["isPinned", "is_pinned"], String(existing.isPinned)),
            existing.isPinned ?? false
          ),
          status: readString(input, ["status"], existing.status ?? "published"),
          publishedAt:
            readString(input, ["publishedAt", "published_at"], existing.publishedAt ?? "") ||
            existing.publishedAt,
          updatedAt: now,
        })
        .where(eq(tNotices.id, id))
        .returning()
    )[0];

    await saveNoticeImages(
      id,
      input instanceof FormData ? getFormFiles(input) : [],
      parseExistingImageIds(input),
      admin.id,
      readIntegerList(input, NOTICE_IMAGE_ORDER_FIELDS)
    );

    return c.json(ok({ ...saved, images: await getNoticeImages(id) }));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.patch("/:id", async (c) => {
  try {
    const admin = await requireAdminUser(c);
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const input = await getInput(c);
    const existing = (
      await db.select().from(tNotices).where(eq(tNotices.id, id)).limit(1)
    )[0];
    if (!existing || existing.status === "deleted") {
      return c.json(fail(c, new Error("notice not found")));
    }

    const saved = (
      await db
        .update(tNotices)
        .set({
          title: readString(input, ["title"], existing.title),
          content: readString(input, ["content"], existing.content ?? ""),
          authorId: admin.id,
          authorName:
            readString(input, ["authorName", "author_name"], existing.authorName ?? "") ||
            toSafeUser(admin).realName ||
            admin.email ||
            "",
          isVisible: isTruthy(
            readString(input, ["isVisible", "is_visible"], String(existing.isVisible)),
            existing.isVisible ?? true
          ),
          isPinned: isTruthy(
            readString(input, ["isPinned", "is_pinned"], String(existing.isPinned)),
            existing.isPinned ?? false
          ),
          status: readString(input, ["status"], existing.status ?? "published"),
          publishedAt:
            readString(input, ["publishedAt", "published_at"], existing.publishedAt ?? "") ||
            existing.publishedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tNotices.id, id))
        .returning()
    )[0];

    await saveNoticeImages(
      id,
      input instanceof FormData ? getFormFiles(input) : [],
      parseExistingImageIds(input),
      admin.id,
      readIntegerList(input, NOTICE_IMAGE_ORDER_FIELDS)
    );

    return c.json(ok({ ...saved, images: await getNoticeImages(id) }));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.delete("/:id", async (c) => {
  try {
    await requireAdminUser(c);
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const rows = await db
      .update(tNotices)
      .set({
        status: "deleted",
        isVisible: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tNotices.id, id))
      .returning();

    if (!rows[0]) {
      return c.json(fail(c, new Error("notice not found")));
    }

    return c.json(ok(rows[0]));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

export default router;
