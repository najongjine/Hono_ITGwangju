import { Hono, type Context } from "hono";
import { and, asc, desc, eq, ilike, ne, or } from "drizzle-orm";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import {
  tCourseSessions,
  tCourses,
  tFileLinks,
  tFiles,
} from "../db/schema.js";
import { insertLocalFileMeta } from "./file_router_query.js";
import { uploadLocalFile } from "../utils/local_file_crud.js";
import {
  createSignedDownloadUrl,
  getStorageBucket,
  uploadFileAndCreateSignedUrl,
} from "../utils/supabase_file_crud.js";
import { convertImageToWebp, isImageMimeType } from "../utils/utils.js";

const router = new Hono();

const COURSE_TABLE = "t_courses";
const DESCRIPTION_IMAGE_ROLE = "description_image";

type DbFile = typeof tFiles.$inferSelect;

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

const isDevelopmentStorage = () => process.env.NODE_ENV !== "production";

const toInt = (value: FormDataEntryValue | string | null, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableInt = (value: FormDataEntryValue | string | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toNullableDate = (value: FormDataEntryValue | string | null) => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
};

const toBoolean = (value: FormDataEntryValue | string | null, fallback = true) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const normalized = String(value).toLowerCase();
  return ["true", "1", "y", "yes", "on"].includes(normalized);
};

const getFormString = (
  form: FormData,
  names: string[],
  fallback = ""
) => {
  for (const name of names) {
    const value = form.get(name);
    if (typeof value === "string") {
      return value;
    }
  }

  return fallback;
};

const getFormFiles = (form: FormData, names: string[]) => {
  const files: File[] = [];

  for (const name of names) {
    for (const item of form.getAll(name)) {
      if (item instanceof File && item.size > 0) {
        files.push(item);
      }
    }
  }

  return files;
};

const getInputString = (
  input: FormData | Record<string, unknown>,
  names: string[],
  fallback = ""
) => {
  if (input instanceof FormData) {
    return getFormString(input, names, fallback);
  }

  for (const name of names) {
    const value = input[name];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  return fallback;
};

const getInputValue = (
  input: FormData | Record<string, unknown>,
  names: string[]
) => {
  if (input instanceof FormData) {
    for (const name of names) {
      const value = input.get(name);
      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  for (const name of names) {
    const value = input[name];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  return null;
};

const readInput = async (c: Context) => {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    return c.req.formData();
  }

  return c.req.json<Record<string, unknown>>();
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

const uploadCourseImage = async (file: File, dir: string) => {
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

  if (isDevelopmentStorage()) {
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

const withFileUrl = async (file: DbFile | null) => {
  if (!file) {
    return null;
  }

  const storageKey = file.storageKey ?? "";
  const url =
    file.storageType === "supabase" && storageKey
      ? await createSignedDownloadUrl(storageKey, 60 * 10)
      : storageKey
        ? `/api/file/files/download?key=${encodeURIComponent(storageKey)}`
        : "";

  return {
    ...file,
    url,
  };
};

const getCourseImages = async (course: typeof tCourses.$inferSelect) => {
  const thumbnailRows = course.thumbnailFileId
    ? await db
        .select()
        .from(tFiles)
        .where(eq(tFiles.id, course.thumbnailFileId))
        .limit(1)
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
        eq(tFileLinks.targetId, course.id),
        eq(tFileLinks.fileRole, DESCRIPTION_IMAGE_ROLE)
      )
    )
    .orderBy(asc(tFileLinks.sortOrder), asc(tFileLinks.id));

  return {
    thumbnail: await withFileUrl(thumbnailRows[0] ?? null),
    descriptionImages: await Promise.all(
      descriptionRows.map(async ({ link, file }) => ({
        link,
        file: await withFileUrl(file),
      }))
    ),
  };
};

const toCourseResponse = async (course: typeof tCourses.$inferSelect) => ({
  ...course,
  ...(await getCourseImages(course)),
  sessions: await getCourseSessions(course.id),
});

const getCourseById = async (id: number) => {
  const rows = await db
    .select()
    .from(tCourses)
    .where(eq(tCourses.id, id))
    .limit(1);

  return rows[0] ?? null;
};

const getCourseSessions = async (courseId: number, includeDeleted = false) => {
  const where = [
    eq(tCourseSessions.courseId, courseId),
    includeDeleted ? undefined : ne(tCourseSessions.status, "deleted"),
  ].filter(Boolean);

  return db
    .select()
    .from(tCourseSessions)
    .where(and(...where))
    .orderBy(asc(tCourseSessions.sessionNo), asc(tCourseSessions.startDate), asc(tCourseSessions.id));
};

const getCourseSessionById = async (
  courseId: number,
  sessionId: number,
  includeDeleted = false
) => {
  const where = [
    eq(tCourseSessions.courseId, courseId),
    eq(tCourseSessions.id, sessionId),
    includeDeleted ? undefined : ne(tCourseSessions.status, "deleted"),
  ].filter(Boolean);
  const rows = await db
    .select()
    .from(tCourseSessions)
    .where(and(...where))
    .limit(1);

  return rows[0] ?? null;
};

router.get("/", async (c) => {
  try {
    const q = String(c.req.query("q") ?? "").trim();
    const includeDeleted = toBoolean(c.req.query("includeDeleted") ?? null, false);
    const where = [
      includeDeleted ? undefined : ne(tCourses.status, "deleted"),
      q
        ? or(
            ilike(tCourses.courseName, `%${q}%`),
            ilike(tCourses.summary, `%${q}%`)
          )
        : undefined,
    ].filter(Boolean);
    const courses = await db
      .select()
      .from(tCourses)
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(asc(tCourses.sortOrder), desc(tCourses.createdAt));

    return c.json(ok(await Promise.all(courses.map(toCourseResponse))));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.get("/:courseId/sessions", async (c) => {
  try {
    const courseId = Number(c.req.param("courseId"));
    if (!Number.isFinite(courseId) || courseId <= 0) {
      return c.json(fail(new Error("valid courseId is required")));
    }

    const course = await getCourseById(courseId);
    if (!course) {
      return c.json(fail(new Error("course not found")));
    }

    const includeDeleted = toBoolean(c.req.query("includeDeleted") ?? null, false);
    return c.json(ok(await getCourseSessions(courseId, includeDeleted)));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.get("/:courseId/sessions/:sessionId", async (c) => {
  try {
    const courseId = Number(c.req.param("courseId"));
    const sessionId = Number(c.req.param("sessionId"));
    if (!Number.isFinite(courseId) || courseId <= 0) {
      return c.json(fail(new Error("valid courseId is required")));
    }
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return c.json(fail(new Error("valid sessionId is required")));
    }

    const session = await getCourseSessionById(courseId, sessionId);
    if (!session) {
      return c.json(fail(new Error("course session not found")));
    }

    return c.json(ok(session));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.post("/:courseId/sessions", async (c) => {
  try {
    const courseId = Number(c.req.param("courseId"));
    if (!Number.isFinite(courseId) || courseId <= 0) {
      return c.json(fail(new Error("valid courseId is required")));
    }

    const course = await getCourseById(courseId);
    if (!course) {
      return c.json(fail(new Error("course not found")));
    }

    const input = await readInput(c);
    const id = toInt(getInputValue(input, ["id"]), 0);
    if (id < 0) {
      return c.json(fail(new Error("id must be 0 or a positive number")));
    }

    if (id > 0) {
      const existing = await getCourseSessionById(courseId, id, true);
      if (!existing) {
        return c.json(fail(new Error("course session not found")));
      }
    }

    const payload = {
      sessionName: getInputString(input, ["sessionName", "session_name"]).trim(),
      sessionNo: toNullableInt(getInputValue(input, ["sessionNo", "session_no"])),
      startDate: toNullableDate(getInputValue(input, ["startDate", "start_date"])),
      endDate: toNullableDate(getInputValue(input, ["endDate", "end_date"])),
      applyStartDate: toNullableDate(
        getInputValue(input, ["applyStartDate", "apply_start_date"])
      ),
      applyEndDate: toNullableDate(
        getInputValue(input, ["applyEndDate", "apply_end_date"])
      ),
      capacity: toInt(getInputValue(input, ["capacity"]), 0),
      location: getInputString(input, ["location"]),
      status: getInputString(input, ["status"], "recruiting"),
    };

    if (!payload.sessionName) {
      return c.json(fail(new Error("sessionName is required")));
    }

    const now = new Date().toISOString();
    const rows =
      id === 0
        ? await db
            .insert(tCourseSessions)
            .values({
              courseId,
              ...payload,
            })
            .returning()
        : await db
            .update(tCourseSessions)
            .set({
              ...payload,
              updatedAt: now,
            })
            .where(
              and(
                eq(tCourseSessions.id, id),
                eq(tCourseSessions.courseId, courseId)
              )
            )
            .returning();

    return c.json(ok(rows[0]));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.delete("/:courseId/sessions/:sessionId", async (c) => {
  try {
    const courseId = Number(c.req.param("courseId"));
    const sessionId = Number(c.req.param("sessionId"));
    if (!Number.isFinite(courseId) || courseId <= 0) {
      return c.json(fail(new Error("valid courseId is required")));
    }
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return c.json(fail(new Error("valid sessionId is required")));
    }

    const rows = await db
      .update(tCourseSessions)
      .set({
        status: "deleted",
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(tCourseSessions.id, sessionId),
          eq(tCourseSessions.courseId, courseId)
        )
      )
      .returning();

    if (!rows[0]) {
      return c.json(fail(new Error("course session not found")));
    }

    return c.json(ok(rows[0]));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.get("/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(new Error("valid id is required")));
    }

    const rows = await db
      .select()
      .from(tCourses)
      .where(eq(tCourses.id, id))
      .limit(1);
    if (!rows[0]) {
      return c.json(fail(new Error("course not found")));
    }

    return c.json(ok(await toCourseResponse(rows[0])));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.post("/", async (c) => {
  try {
    const form = await c.req.formData();
    const id = toInt(form.get("id"), 0);
    const mainImages = getFormFiles(form, ["mainImage", "thumbnail", "thumbnailFile"]);
    const descriptionImages = getFormFiles(form, [
      "descriptionImages",
      "descriptionImage",
      "detailImages",
    ]);
    const payload = {
      courseName: getFormString(form, ["courseName", "course_name"]).trim(),
      summary: getFormString(form, ["summary"]),
      description: getFormString(form, ["description"]),
      isVisible: toBoolean(form.get("isVisible") ?? form.get("is_visible"), true),
      status: getFormString(form, ["status"], "active"),
      sortOrder: toInt(form.get("sortOrder") ?? form.get("sort_order"), 0),
      createdBy: toNullableInt(form.get("createdBy") ?? form.get("created_by")),
      updatedBy: toNullableInt(form.get("updatedBy") ?? form.get("updated_by")),
    };

    if (!payload.courseName) {
      return c.json(fail(new Error("courseName is required")));
    }

    if (id < 0) {
      return c.json(fail(new Error("id must be 0 or a positive number")));
    }

    if (id > 0) {
      const existing = await db
        .select({ id: tCourses.id })
        .from(tCourses)
        .where(eq(tCourses.id, id))
        .limit(1);

      if (!existing[0]) {
        return c.json(fail(new Error("course not found")));
      }
    }

    const uploadedMainImage =
      mainImages.length > 0
        ? await uploadCourseImage(mainImages[0], "courses/main")
        : null;
    const uploadedDescriptionImages: DbFile[] = [];
    for (const image of descriptionImages) {
      const uploaded = await uploadCourseImage(image, "courses/descriptions");
      if (uploaded) {
        uploadedDescriptionImages.push(uploaded);
      }
    }

    const saved = await db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const course =
        id === 0
          ? (
              await tx
                .insert(tCourses)
                .values({
                  ...payload,
                  thumbnailFileId: uploadedMainImage?.id ?? null,
                  updatedBy: payload.updatedBy ?? payload.createdBy,
                })
                .returning()
            )[0]
          : (
              await tx
                .update(tCourses)
                .set({
                  courseName: payload.courseName,
                  summary: payload.summary,
                  description: payload.description,
                  isVisible: payload.isVisible,
                  status: payload.status,
                  sortOrder: payload.sortOrder,
                  updatedBy: payload.updatedBy,
                  updatedAt: now,
                  ...(uploadedMainImage?.id
                    ? { thumbnailFileId: uploadedMainImage.id }
                    : {}),
                })
                .where(eq(tCourses.id, id))
                .returning()
            )[0];

      if (!course) {
        throw new Error("course not found");
      }

      if (uploadedDescriptionImages.length > 0) {
        await tx
          .delete(tFileLinks)
          .where(
            and(
              eq(tFileLinks.targetTable, COURSE_TABLE),
              eq(tFileLinks.targetId, course.id),
              eq(tFileLinks.fileRole, DESCRIPTION_IMAGE_ROLE)
            )
          );
        await tx.insert(tFileLinks).values(
          uploadedDescriptionImages.map((file, index) => ({
            fileId: file.id,
            targetTable: COURSE_TABLE,
            targetId: course.id,
            fileRole: DESCRIPTION_IMAGE_ROLE,
            sortOrder: index,
          }))
        );
      }

      return course;
    });

    return c.json(ok(await toCourseResponse(saved)));
  } catch (error) {
    return c.json(fail(error));
  }
});

router.delete("/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(new Error("valid id is required")));
    }

    const rows = await db
      .update(tCourses)
      .set({
        status: "deleted",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tCourses.id, id))
      .returning();

    if (!rows[0]) {
      return c.json(fail(new Error("course not found")));
    }

    return c.json(ok(rows[0]));
  } catch (error) {
    return c.json(fail(error));
  }
});

export default router;
