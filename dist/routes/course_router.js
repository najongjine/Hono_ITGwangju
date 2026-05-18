import { Hono } from "hono";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { tCourseSessions, tCourses, tEnrollments, tFileLinks, tUser, } from "../db/schema.js";
import { toSafeUser, withUserRoles } from "../utils/auth_utils.js";
import { getCourseImageResponse, getCourseImageRows, uploadCourseImage, } from "../utils/course_image_utils.js";
const router = new Hono();
const MODULE_NAME = "course_router";
const COURSE_TABLE = "t_courses";
const DESCRIPTION_IMAGE_ROLE = "description_image";
const COURSE_STATUS_VALUES = ["모집중", "운영중", "마감"];
const DELETED_STATUS = "deleted";
const ok = (data = null, message = "") => ({
    success: true,
    data,
    code: "",
    msg: message,
});
const getApiName = (c) => `${c.req.method} ${new URL(c.req.url).pathname}`;
const getImageBaseUrl = (c) => (() => {
    const configuredUrl = process.env.PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL;
    if (configuredUrl) {
        return configuredUrl;
    }
    const forwardedHost = c.req.header("x-forwarded-host") ?? c.req.header("host");
    if (forwardedHost) {
        const forwardedProto = c.req.header("x-forwarded-proto") ?? "https";
        return `${forwardedProto.split(",")[0]}://${forwardedHost.split(",")[0]}`;
    }
    return new URL(c.req.url).origin;
})().replace(/\/+$/, "");
const parseIntegerListValue = (value) => {
    const text = String(value).trim();
    if (!text) {
        return [];
    }
    if (text.startsWith("[") && text.endsWith("]")) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed)
                ? parsed.flatMap((item) => parseIntegerListValue(String(item)))
                : [];
        }
        catch {
            return [];
        }
    }
    return text
        .split(",")
        .map((value) => Number(String(value).trim()))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.floor(value));
};
const parseIntegerList = (values) => values.flatMap(parseIntegerListValue);
const getFormIntegerList = (form, names) => parseIntegerList(names.flatMap((name) => form.getAll(name)));
const fail = (c, error) => ({
    success: false,
    data: null,
    code: "",
    module: MODULE_NAME,
    api: getApiName(c),
    msg: error instanceof Error ? error.message : String(error),
});
const statusAliasMap = new Map([
    ["모집중", "모집중"],
    ["recruiting", "모집중"],
    ["recruit", "모집중"],
    ["open", "모집중"],
    ["운영중", "운영중"],
    ["active", "운영중"],
    ["running", "운영중"],
    ["ongoing", "운영중"],
    ["마감", "마감"],
    ["closed", "마감"],
    ["completed", "마감"],
    ["ended", "마감"],
    ["end", "마감"],
    ["종료", "마감"],
]);
const normalizeCourseStatus = (value, fallback = "모집중") => {
    const text = String(value ?? "").trim();
    if (!text) {
        return fallback;
    }
    const normalized = statusAliasMap.get(text.toLowerCase()) ?? statusAliasMap.get(text);
    if (!normalized) {
        throw new Error(`status must be one of: ${COURSE_STATUS_VALUES.join(", ")}`);
    }
    return normalized;
};
const toResponseCourseStatus = (status) => {
    if (status === DELETED_STATUS) {
        return DELETED_STATUS;
    }
    return normalizeCourseStatus(status, "운영중");
};
const normalizeCourse = (course) => ({
    ...course,
    status: toResponseCourseStatus(course.status),
});
const normalizeSession = (session) => ({
    ...session,
    status: toResponseCourseStatus(session.status),
});
const getSessionEnrollmentCounts = async (sessionIds) => {
    if (sessionIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select({
        sessionId: tEnrollments.sessionId,
        totalEnrollment: sql `count(${tEnrollments.id})::int`,
    })
        .from(tEnrollments)
        .where(and(inArray(tEnrollments.sessionId, sessionIds), ne(tEnrollments.applyStatus, "deleted")))
        .groupBy(tEnrollments.sessionId);
    return new Map(rows.map((row) => [row.sessionId, Number(row.totalEnrollment ?? 0)]));
};
const attachSessionStats = async (sessions) => {
    const counts = await getSessionEnrollmentCounts(sessions.map((session) => session.id));
    return sessions.map((session) => ({
        ...normalizeSession(session),
        totalEnrollment: counts.get(session.id) ?? 0,
    }));
};
const attachCourseStats = async (course, sessions) => {
    const sessionsWithStats = await attachSessionStats(sessions);
    const totalCapacity = sessionsWithStats.reduce((sum, session) => sum + Number(session.capacity ?? 0), 0);
    const totalEnrollment = sessionsWithStats.reduce((sum, session) => sum + Number(session.totalEnrollment ?? 0), 0);
    return {
        ...normalizeCourse(course),
        sessionCount: sessionsWithStats.length,
        totalCapacity,
        totalEnrollment,
        sessions: sessionsWithStats,
    };
};
const getCourseSessions = (courseId, includeDeleted = false) => db
    .select()
    .from(tCourseSessions)
    .where(and(eq(tCourseSessions.courseId, courseId), includeDeleted ? undefined : ne(tCourseSessions.status, DELETED_STATUS)))
    .orderBy(asc(tCourseSessions.sessionNo), asc(tCourseSessions.startDate), asc(tCourseSessions.id));
router.get("/images/:fileId", async (c) => {
    try {
        const fileId = Number(c.req.param("fileId"));
        if (!Number.isFinite(fileId) || fileId <= 0) {
            return c.json(fail(c, new Error("valid fileId is required")));
        }
        return getCourseImageResponse(fileId);
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.get("/", async (c) => {
    try {
        const q = String(c.req.query("q") ?? "").trim();
        const includeDeleted = ["true", "1", "y", "yes", "on"].includes(String(c.req.query("includeDeleted") ?? "").toLowerCase());
        const status = c.req.query("status");
        const where = [
            includeDeleted ? undefined : ne(tCourses.status, "deleted"),
            q
                ? or(ilike(tCourses.courseName, `%${q}%`), ilike(tCourses.summary, `%${q}%`))
                : undefined,
            status && status !== DELETED_STATUS
                ? eq(tCourses.status, normalizeCourseStatus(status, "모집중"))
                : undefined,
        ].filter(Boolean);
        const courses = await db
            .select()
            .from(tCourses)
            .where(where.length > 0 ? and(...where) : undefined)
            .orderBy(asc(tCourses.sortOrder), desc(tCourses.createdAt));
        const data = await Promise.all(courses.map(async (course) => {
            const sessions = await getCourseSessions(course.id);
            const courseWithStats = await attachCourseStats(course, sessions);
            return {
                ...courseWithStats,
                ...(await getCourseImageRows(course.id, course.thumbnailFileId, getImageBaseUrl(c))),
            };
        }));
        return c.json(ok(data));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.get("/:courseId/sessions", async (c) => {
    try {
        const courseId = Number(c.req.param("courseId"));
        if (!Number.isFinite(courseId) || courseId <= 0) {
            return c.json(fail(c, new Error("valid courseId is required")));
        }
        const courseRows = await db
            .select({ id: tCourses.id })
            .from(tCourses)
            .where(eq(tCourses.id, courseId))
            .limit(1);
        if (!courseRows[0]) {
            return c.json(fail(c, new Error("course not found")));
        }
        const includeDeleted = ["true", "1", "y", "yes", "on"].includes(String(c.req.query("includeDeleted") ?? "").toLowerCase());
        const status = c.req.query("status");
        const where = [
            eq(tCourseSessions.courseId, courseId),
            includeDeleted ? undefined : ne(tCourseSessions.status, "deleted"),
            status && status !== DELETED_STATUS
                ? eq(tCourseSessions.status, normalizeCourseStatus(status, "모집중"))
                : undefined,
        ].filter(Boolean);
        const sessions = await db
            .select()
            .from(tCourseSessions)
            .where(and(...where))
            .orderBy(asc(tCourseSessions.sessionNo), asc(tCourseSessions.startDate), asc(tCourseSessions.id));
        return c.json(ok(await attachSessionStats(sessions)));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.get("/:courseId/sessions/:sessionId", async (c) => {
    try {
        const courseId = Number(c.req.param("courseId"));
        const sessionId = Number(c.req.param("sessionId"));
        if (!Number.isFinite(courseId) || courseId <= 0) {
            return c.json(fail(c, new Error("valid courseId is required")));
        }
        if (!Number.isFinite(sessionId) || sessionId <= 0) {
            return c.json(fail(c, new Error("valid sessionId is required")));
        }
        const sessionRows = await db
            .select()
            .from(tCourseSessions)
            .where(and(eq(tCourseSessions.courseId, courseId), eq(tCourseSessions.id, sessionId), ne(tCourseSessions.status, "deleted")))
            .limit(1);
        if (!sessionRows[0]) {
            return c.json(fail(c, new Error("course session not found")));
        }
        return c.json(ok((await attachSessionStats([sessionRows[0]]))[0]));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.get("/:courseId/sessions/:sessionId/enrollments", async (c) => {
    try {
        const courseId = Number(c.req.param("courseId"));
        const sessionId = Number(c.req.param("sessionId"));
        if (!Number.isFinite(courseId) || courseId <= 0) {
            return c.json(fail(c, new Error("valid courseId is required")));
        }
        if (!Number.isFinite(sessionId) || sessionId <= 0) {
            return c.json(fail(c, new Error("valid sessionId is required")));
        }
        const sessionRows = await db
            .select({ id: tCourseSessions.id })
            .from(tCourseSessions)
            .where(and(eq(tCourseSessions.courseId, courseId), eq(tCourseSessions.id, sessionId), ne(tCourseSessions.status, DELETED_STATUS)))
            .limit(1);
        if (!sessionRows[0]) {
            return c.json(fail(c, new Error("course session not found")));
        }
        const rows = await db
            .select({
            enrollment: tEnrollments,
            user: tUser,
        })
            .from(tEnrollments)
            .leftJoin(tUser, eq(tUser.id, tEnrollments.userId))
            .where(and(eq(tEnrollments.courseId, courseId), eq(tEnrollments.sessionId, sessionId), ne(tEnrollments.applyStatus, "deleted")))
            .orderBy(desc(tEnrollments.appliedAt), desc(tEnrollments.id));
        const data = await Promise.all(rows.map(async ({ enrollment, user }) => ({
            ...enrollment,
            user: user ? toSafeUser(await withUserRoles(user)) : null,
        })));
        return c.json(ok(data));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.post("/:courseId/sessions", async (c) => {
    try {
        const courseId = Number(c.req.param("courseId"));
        if (!Number.isFinite(courseId) || courseId <= 0) {
            return c.json(fail(c, new Error("valid courseId is required")));
        }
        const courseRows = await db
            .select({ id: tCourses.id })
            .from(tCourses)
            .where(eq(tCourses.id, courseId))
            .limit(1);
        if (!courseRows[0]) {
            return c.json(fail(c, new Error("course not found")));
        }
        const contentType = c.req.header("content-type") ?? "";
        const input = contentType.includes("multipart/form-data") ||
            contentType.includes("application/x-www-form-urlencoded")
            ? await c.req.formData()
            : await c.req.json();
        const inputValue = (camelName, snakeName = camelName) => {
            if (input instanceof FormData) {
                return input.get(camelName) ?? input.get(snakeName);
            }
            return input[camelName] ?? input[snakeName];
        };
        const parsedId = Number(inputValue("id") ?? 0);
        const id = Number.isFinite(parsedId) ? parsedId : 0;
        if (id < 0) {
            return c.json(fail(c, new Error("id must be 0 or a positive number")));
        }
        if (id > 0) {
            const existingRows = await db
                .select({ id: tCourseSessions.id })
                .from(tCourseSessions)
                .where(and(eq(tCourseSessions.courseId, courseId), eq(tCourseSessions.id, id)))
                .limit(1);
            if (!existingRows[0]) {
                return c.json(fail(c, new Error("course session not found")));
            }
        }
        const sessionNo = Number(inputValue("sessionNo", "session_no"));
        const capacity = Number(inputValue("capacity") ?? 20);
        const payload = {
            sessionName: String(inputValue("sessionName", "session_name") ?? "").trim() || null,
            sessionNo: Number.isFinite(sessionNo) && sessionNo > 0 ? sessionNo : null,
            startDate: String(inputValue("startDate", "start_date") ?? "").trim() || null,
            endDate: String(inputValue("endDate", "end_date") ?? "").trim() || null,
            classStartTime: String(inputValue("classStartTime", "class_start_time") ?? "").trim() || null,
            classEndTime: String(inputValue("classEndTime", "class_end_time") ?? "").trim() || null,
            capacity: Number.isFinite(capacity) ? capacity : 20,
            status: normalizeCourseStatus(inputValue("status"), "모집중"),
        };
        const now = new Date().toISOString();
        const rows = id === 0
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
                .where(and(eq(tCourseSessions.id, id), eq(tCourseSessions.courseId, courseId)))
                .returning();
        return c.json(ok(rows[0] ? (await attachSessionStats([rows[0]]))[0] : null));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.delete("/:courseId/sessions/:sessionId", async (c) => {
    try {
        const courseId = Number(c.req.param("courseId"));
        const sessionId = Number(c.req.param("sessionId"));
        if (!Number.isFinite(courseId) || courseId <= 0) {
            return c.json(fail(c, new Error("valid courseId is required")));
        }
        if (!Number.isFinite(sessionId) || sessionId <= 0) {
            return c.json(fail(c, new Error("valid sessionId is required")));
        }
        const rows = await db
            .update(tCourseSessions)
            .set({
            status: DELETED_STATUS,
            updatedAt: new Date().toISOString(),
        })
            .where(and(eq(tCourseSessions.id, sessionId), eq(tCourseSessions.courseId, courseId)))
            .returning();
        if (!rows[0]) {
            return c.json(fail(c, new Error("course session not found")));
        }
        return c.json(ok(normalizeSession(rows[0])));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.get("/:id", async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (!Number.isFinite(id) || id <= 0) {
            return c.json(fail(c, new Error("valid id is required")));
        }
        const rows = await db
            .select()
            .from(tCourses)
            .where(eq(tCourses.id, id))
            .limit(1);
        if (!rows[0]) {
            return c.json(fail(c, new Error("course not found")));
        }
        const course = rows[0];
        const sessions = await getCourseSessions(course.id);
        const courseWithStats = await attachCourseStats(course, sessions);
        return c.json(ok({
            ...courseWithStats,
            ...(await getCourseImageRows(course.id, course.thumbnailFileId, getImageBaseUrl(c))),
        }));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.post("/", async (c) => {
    try {
        const form = await c.req.formData();
        const parsedId = Number(form.get("id") ?? 0);
        const id = Number.isFinite(parsedId) ? parsedId : 0;
        const mainImages = [
            ...form.getAll("mainImage"),
            ...form.getAll("thumbnail"),
            ...form.getAll("thumbnailFile"),
        ].filter((item) => item instanceof File && item.size > 0);
        const descriptionImages = [
            ...form.getAll("descriptionImages"),
            ...form.getAll("descriptionImage"),
            ...form.getAll("detailImages"),
        ].filter((item) => item instanceof File && item.size > 0);
        const descriptionImageOrders = getFormIntegerList(form, [
            "descriptionImageOrders",
            "descriptionImageOrder",
            "description_image_orders",
            "description_image_order",
            "detailImageOrders",
            "detail_image_orders",
            "imageOrders",
            "image_orders",
            "sortOrders",
            "sort_orders",
        ]);
        const sortOrder = Number(form.get("sortOrder") ?? form.get("sort_order") ?? 0);
        const createdBy = Number(form.get("createdBy") ?? form.get("created_by"));
        const updatedBy = Number(form.get("updatedBy") ?? form.get("updated_by"));
        const isVisibleValue = form.get("isVisible") ?? form.get("is_visible");
        const payload = {
            courseName: String(form.get("courseName") ?? form.get("course_name") ?? "").trim(),
            summary: String(form.get("summary") ?? ""),
            description: String(form.get("description") ?? ""),
            isVisible: isVisibleValue === null || isVisibleValue === undefined || isVisibleValue === ""
                ? true
                : ["true", "1", "y", "yes", "on"].includes(String(isVisibleValue).toLowerCase()),
            status: normalizeCourseStatus(form.get("status"), "운영중"),
            sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
            createdBy: Number.isFinite(createdBy) && createdBy > 0 ? createdBy : null,
            updatedBy: Number.isFinite(updatedBy) && updatedBy > 0 ? updatedBy : null,
        };
        if (!payload.courseName) {
            return c.json(fail(c, new Error("courseName is required")));
        }
        if (id < 0) {
            return c.json(fail(c, new Error("id must be 0 or a positive number")));
        }
        if (id > 0) {
            const existing = await db
                .select({ id: tCourses.id })
                .from(tCourses)
                .where(eq(tCourses.id, id))
                .limit(1);
            if (!existing[0]) {
                return c.json(fail(c, new Error("course not found")));
            }
        }
        const uploadedMainImage = mainImages.length > 0
            ? await uploadCourseImage(mainImages[0], "courses/main")
            : null;
        const uploadedDescriptionImages = [];
        for (const [index, image] of descriptionImages.entries()) {
            const uploaded = await uploadCourseImage(image, "courses/descriptions");
            if (uploaded) {
                uploadedDescriptionImages.push({
                    file: uploaded,
                    sortOrder: descriptionImageOrders[index] ?? index,
                });
            }
        }
        const saved = await db.transaction(async (tx) => {
            const now = new Date().toISOString();
            const course = id === 0
                ? (await tx
                    .insert(tCourses)
                    .values({
                    ...payload,
                    thumbnailFileId: uploadedMainImage?.id ?? null,
                    updatedBy: payload.updatedBy ?? payload.createdBy,
                })
                    .returning())[0]
                : (await tx
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
                    .returning())[0];
            if (!course) {
                throw new Error("course not found");
            }
            if (uploadedDescriptionImages.length > 0) {
                await tx
                    .delete(tFileLinks)
                    .where(and(eq(tFileLinks.targetTable, COURSE_TABLE), eq(tFileLinks.targetId, course.id), eq(tFileLinks.fileRole, DESCRIPTION_IMAGE_ROLE)));
                await tx.insert(tFileLinks).values(uploadedDescriptionImages.map(({ file, sortOrder }) => ({
                    fileId: file.id,
                    targetTable: COURSE_TABLE,
                    targetId: course.id,
                    fileRole: DESCRIPTION_IMAGE_ROLE,
                    sortOrder,
                })));
            }
            return course;
        });
        const sessions = await getCourseSessions(saved.id);
        const courseWithStats = await attachCourseStats(saved, sessions);
        return c.json(ok({
            ...courseWithStats,
            ...(await getCourseImageRows(saved.id, saved.thumbnailFileId, getImageBaseUrl(c))),
        }));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.delete("/:id", async (c) => {
    try {
        const id = Number(c.req.param("id"));
        if (!Number.isFinite(id) || id <= 0) {
            return c.json(fail(c, new Error("valid id is required")));
        }
        const rows = await db
            .update(tCourses)
            .set({
            status: DELETED_STATUS,
            updatedAt: new Date().toISOString(),
        })
            .where(eq(tCourses.id, id))
            .returning();
        if (!rows[0]) {
            return c.json(fail(c, new Error("course not found")));
        }
        return c.json(ok(normalizeCourse(rows[0])));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
export default router;
