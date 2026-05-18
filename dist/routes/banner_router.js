import { Hono } from "hono";
import { and, asc, desc, eq, gte, ilike, isNull, lte, ne, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { tBanner, tFiles } from "../db/schema.js";
import { getCourseImageResponse, uploadCourseImage, } from "../utils/course_image_utils.js";
import { isAdminUser, verifyUserToken } from "../utils/auth_utils.js";
const router = new Hono();
const MODULE_NAME = "banner_router";
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
const buildImageUrl = (path, baseUrl = "") => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    return normalizedBaseUrl
        ? `${normalizedBaseUrl}${normalizedPath}`
        : normalizedPath;
};
const fail = (c, error) => ({
    success: false,
    data: null,
    code: "",
    module: MODULE_NAME,
    api: getApiName(c),
    msg: error instanceof Error ? error.message : String(error),
});
const isTruthy = (value, fallback = false) => {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    return ["true", "1", "y", "yes", "on"].includes(String(value).toLowerCase());
};
const readJson = async (c) => {
    try {
        return await c.req.json();
    }
    catch {
        return {};
    }
};
const getInput = async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    if (contentType.includes("multipart/form-data") ||
        contentType.includes("application/x-www-form-urlencoded")) {
        return c.req.formData();
    }
    return readJson(c);
};
const readValue = (input, names) => {
    for (const name of names) {
        const value = input instanceof FormData ? input.get(name) : input[name];
        if (value !== undefined && value !== null) {
            return value;
        }
    }
    return undefined;
};
const readString = (input, names, fallback = "") => {
    const value = readValue(input, names);
    return value === undefined ? fallback : String(value).trim();
};
const readNumber = (input, names, fallback = 0) => {
    const value = Number(readValue(input, names) ?? fallback);
    return Number.isFinite(value) ? value : fallback;
};
const readNullableDateTime = (input, names, fallback = null) => {
    const value = readValue(input, names);
    if (value === undefined) {
        return fallback;
    }
    const text = String(value).trim();
    return text ? text : null;
};
const readImageFileId = (input) => {
    const value = readValue(input, ["imageFileId", "image_file_id", "fileId", "file_id"]);
    if (value === undefined) {
        return undefined;
    }
    const imageFileId = Number(value);
    return Number.isFinite(imageFileId) && imageFileId > 0
        ? Math.floor(imageFileId)
        : null;
};
const getFormImage = (form) => [
    ...form.getAll("image"),
    ...form.getAll("bannerImage"),
    ...form.getAll("banner_image"),
    ...form.getAll("file"),
].find((item) => item instanceof File && item.size > 0) ?? null;
const requireAdminUser = async (c) => {
    const user = await verifyUserToken(c.req.header("authorization") ?? "");
    if (await isAdminUser(user)) {
        return user;
    }
    throw new Error("admin permission is required");
};
const withBannerFileUrl = (file, baseUrl = "") => {
    if (!file) {
        return null;
    }
    return {
        ...file,
        url: file.storageKey
            ? buildImageUrl(`/api/banners/images/${file.id}`, baseUrl)
            : "",
    };
};
const getBannerImage = async (imageFileId, baseUrl = "") => {
    if (!imageFileId) {
        return null;
    }
    const rows = await db.select().from(tFiles).where(eq(tFiles.id, imageFileId)).limit(1);
    return withBannerFileUrl(rows[0] ?? null, baseUrl);
};
const withImage = async (banner, baseUrl = "") => ({
    ...banner,
    image: await getBannerImage(banner.imageFileId, baseUrl),
});
const buildPublicWhere = (position, includeHidden) => {
    const now = new Date().toISOString();
    return [
        position ? eq(tBanner.position, position) : undefined,
        includeHidden ? undefined : eq(tBanner.isVisible, true),
        includeHidden ? undefined : eq(tBanner.status, "active"),
        includeHidden ? undefined : or(isNull(tBanner.startAt), lte(tBanner.startAt, now)),
        includeHidden ? undefined : or(isNull(tBanner.endAt), gte(tBanner.endAt, now)),
        includeHidden ? undefined : ne(tBanner.status, "deleted"),
    ].filter(Boolean);
};
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
        const includeHidden = isTruthy(c.req.query("includeHidden"));
        if (includeHidden) {
            await requireAdminUser(c);
        }
        const position = String(c.req.query("position") ?? "").trim();
        const q = String(c.req.query("q") ?? "").trim();
        const where = [
            ...buildPublicWhere(position, includeHidden),
            q
                ? or(ilike(tBanner.title, `%${q}%`), ilike(tBanner.subtitle, `%${q}%`), ilike(tBanner.description, `%${q}%`))
                : undefined,
        ].filter(Boolean);
        const banners = await db
            .select()
            .from(tBanner)
            .where(where.length > 0 ? and(...where) : undefined)
            .orderBy(asc(tBanner.sortOrder), desc(tBanner.createdAt), desc(tBanner.id));
        const imageBaseUrl = getImageBaseUrl(c);
        return c.json(ok(await Promise.all(banners.map((banner) => withImage(banner, imageBaseUrl)))));
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
        const rows = await db.select().from(tBanner).where(eq(tBanner.id, id)).limit(1);
        const banner = rows[0];
        if (!banner || banner.status === "deleted") {
            return c.json(fail(c, new Error("banner not found")));
        }
        if (!banner.isVisible || banner.status !== "active") {
            await requireAdminUser(c);
        }
        return c.json(ok(await withImage(banner, getImageBaseUrl(c))));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.post("/", async (c) => {
    try {
        const admin = await requireAdminUser(c);
        const input = await getInput(c);
        const id = readNumber(input, ["id"], 0);
        if (id < 0) {
            return c.json(fail(c, new Error("id must be 0 or a positive number")));
        }
        const existing = id > 0
            ? (await db.select().from(tBanner).where(eq(tBanner.id, id)).limit(1))[0]
            : null;
        if (id > 0 && (!existing || existing.status === "deleted")) {
            return c.json(fail(c, new Error("banner not found")));
        }
        const uploadedImage = input instanceof FormData && getFormImage(input)
            ? await uploadCourseImage(getFormImage(input), "banners/images")
            : null;
        const explicitImageFileId = readImageFileId(input);
        const imageFileId = uploadedImage?.id ?? explicitImageFileId ?? existing?.imageFileId ?? null;
        const now = new Date().toISOString();
        const payload = {
            title: readString(input, ["title"], existing?.title ?? ""),
            subtitle: readString(input, ["subtitle"], existing?.subtitle ?? ""),
            description: readString(input, ["description"], existing?.description ?? ""),
            imageFileId,
            linkUrl: readString(input, ["linkUrl", "link_url"], existing?.linkUrl ?? ""),
            linkTarget: readString(input, ["linkTarget", "link_target"], existing?.linkTarget ?? "_self"),
            position: readString(input, ["position"], existing?.position ?? "main") || "main",
            isVisible: isTruthy(readString(input, ["isVisible", "is_visible"], String(existing?.isVisible ?? true)), existing?.isVisible ?? true),
            status: readString(input, ["status"], existing?.status ?? "active") || "active",
            sortOrder: readNumber(input, ["sortOrder", "sort_order"], existing?.sortOrder ?? 0),
            startAt: readNullableDateTime(input, ["startAt", "start_at"], existing?.startAt ?? null),
            endAt: readNullableDateTime(input, ["endAt", "end_at"], existing?.endAt ?? null),
            updatedBy: admin.id,
        };
        const saved = id === 0
            ? (await db
                .insert(tBanner)
                .values({
                ...payload,
                createdBy: admin.id,
            })
                .returning())[0]
            : (await db
                .update(tBanner)
                .set({
                ...payload,
                updatedAt: now,
            })
                .where(eq(tBanner.id, id))
                .returning())[0];
        return c.json(ok(await withImage(saved, getImageBaseUrl(c))));
    }
    catch (error) {
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
        const existing = (await db.select().from(tBanner).where(eq(tBanner.id, id)).limit(1))[0];
        if (!existing || existing.status === "deleted") {
            return c.json(fail(c, new Error("banner not found")));
        }
        const image = input instanceof FormData ? getFormImage(input) : null;
        const uploadedImage = image
            ? await uploadCourseImage(image, "banners/images")
            : null;
        const explicitImageFileId = readImageFileId(input);
        const saved = (await db
            .update(tBanner)
            .set({
            title: readString(input, ["title"], existing.title ?? ""),
            subtitle: readString(input, ["subtitle"], existing.subtitle ?? ""),
            description: readString(input, ["description"], existing.description ?? ""),
            imageFileId: uploadedImage?.id ?? explicitImageFileId ?? existing.imageFileId,
            linkUrl: readString(input, ["linkUrl", "link_url"], existing.linkUrl ?? ""),
            linkTarget: readString(input, ["linkTarget", "link_target"], existing.linkTarget ?? "_self") ||
                "_self",
            position: readString(input, ["position"], existing.position ?? "main") || "main",
            isVisible: isTruthy(readString(input, ["isVisible", "is_visible"], String(existing.isVisible)), existing.isVisible ?? true),
            status: readString(input, ["status"], existing.status ?? "active") || "active",
            sortOrder: readNumber(input, ["sortOrder", "sort_order"], existing.sortOrder ?? 0),
            startAt: readNullableDateTime(input, ["startAt", "start_at"], existing.startAt),
            endAt: readNullableDateTime(input, ["endAt", "end_at"], existing.endAt),
            updatedBy: admin.id,
            updatedAt: new Date().toISOString(),
        })
            .where(eq(tBanner.id, id))
            .returning())[0];
        return c.json(ok(await withImage(saved, getImageBaseUrl(c))));
    }
    catch (error) {
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
        const existing = (await db.select().from(tBanner).where(eq(tBanner.id, id)).limit(1))[0];
        if (!existing || existing.status === "deleted") {
            return c.json(fail(c, new Error("banner not found")));
        }
        const uploadedImage = input instanceof FormData && getFormImage(input)
            ? await uploadCourseImage(getFormImage(input), "banners/images")
            : null;
        const explicitImageFileId = readImageFileId(input);
        const updateData = {
            updatedBy: admin.id,
            updatedAt: new Date().toISOString(),
        };
        if (readValue(input, ["title"]) !== undefined) {
            updateData.title = readString(input, ["title"]);
        }
        if (readValue(input, ["subtitle"]) !== undefined) {
            updateData.subtitle = readString(input, ["subtitle"]);
        }
        if (readValue(input, ["description"]) !== undefined) {
            updateData.description = readString(input, ["description"]);
        }
        if (uploadedImage?.id || explicitImageFileId !== undefined) {
            updateData.imageFileId = uploadedImage?.id ?? explicitImageFileId;
        }
        if (readValue(input, ["linkUrl", "link_url"]) !== undefined) {
            updateData.linkUrl = readString(input, ["linkUrl", "link_url"]);
        }
        if (readValue(input, ["linkTarget", "link_target"]) !== undefined) {
            updateData.linkTarget = readString(input, ["linkTarget", "link_target"]) || "_self";
        }
        if (readValue(input, ["position"]) !== undefined) {
            updateData.position = readString(input, ["position"]) || "main";
        }
        if (readValue(input, ["isVisible", "is_visible"]) !== undefined) {
            updateData.isVisible = isTruthy(readString(input, ["isVisible", "is_visible"]));
        }
        if (readValue(input, ["status"]) !== undefined) {
            updateData.status = readString(input, ["status"]) || "active";
        }
        if (readValue(input, ["sortOrder", "sort_order"]) !== undefined) {
            updateData.sortOrder = readNumber(input, ["sortOrder", "sort_order"]);
        }
        if (readValue(input, ["startAt", "start_at"]) !== undefined) {
            updateData.startAt = readNullableDateTime(input, ["startAt", "start_at"]);
        }
        if (readValue(input, ["endAt", "end_at"]) !== undefined) {
            updateData.endAt = readNullableDateTime(input, ["endAt", "end_at"]);
        }
        const saved = (await db.update(tBanner).set(updateData).where(eq(tBanner.id, id)).returning())[0];
        return c.json(ok(await withImage(saved, getImageBaseUrl(c))));
    }
    catch (error) {
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
            .update(tBanner)
            .set({
            status: "deleted",
            isVisible: false,
            updatedAt: new Date().toISOString(),
        })
            .where(eq(tBanner.id, id))
            .returning();
        if (!rows[0]) {
            return c.json(fail(c, new Error("banner not found")));
        }
        return c.json(ok(rows[0]));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
export default router;
