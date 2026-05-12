import { Hono } from "hono";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { tUser, tUserRoles } from "../db/schema.js";
import { createUserToken, createTemporaryPassword, encryptPersonalData, hashPassword, sendPasswordResetEmail, toSafeUser, verifyPassword, verifyUserToken, } from "../utils/auth_utils.js";
const router = new Hono();
const MODULE_NAME = "user_router";
const ok = (data = null, message = "") => ({
    success: true,
    data,
    code: "",
    msg: message,
});
const getApiName = (c) => `${c.req.method} ${new URL(c.req.url).pathname}`;
const fail = (c, error) => ({
    success: false,
    data: null,
    code: "",
    module: MODULE_NAME,
    api: getApiName(c),
    msg: error instanceof Error ? error.message : String(error),
});
const readJson = async (c) => {
    try {
        return await c.req.json();
    }
    catch {
        return {};
    }
};
const readString = (input, names, fallback = "") => {
    for (const name of names) {
        const value = input[name];
        if (value !== undefined && value !== null) {
            return String(value).trim();
        }
    }
    return fallback;
};
const readNumber = (input, names) => {
    const value = Number(readString(input, names));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
};
const requireAdminUser = async (c) => {
    const user = await verifyUserToken(c.req.header("authorization") ?? "");
    if (user.role === "admin") {
        return user;
    }
    const roles = await db
        .select({ roleName: tUserRoles.roleName })
        .from(tUserRoles)
        .where(eq(tUserRoles.userId, user.id));
    if (roles.some((role) => role.roleName === "admin")) {
        return user;
    }
    throw new Error("admin permission is required");
};
router.post("/register", async (c) => {
    try {
        const input = await readJson(c);
        const username = readString(input, ["username", "loginId", "login_id"]).toLowerCase();
        const email = readString(input, ["email"]).toLowerCase();
        const password = readString(input, ["password"]);
        const realName = readString(input, ["realName", "real_name", "name"]);
        const phone = readString(input, ["phone"]);
        if (!email) {
            return c.json(fail(c, new Error("email is required")));
        }
        if (!password || password.length < 8) {
            return c.json(fail(c, new Error("password must be at least 8 characters")));
        }
        if (!realName) {
            return c.json(fail(c, new Error("realName is required")));
        }
        if (!phone) {
            return c.json(fail(c, new Error("phone is required")));
        }
        const loginId = username || email;
        const existing = await db
            .select({ id: tUser.id })
            .from(tUser)
            .where(or(eq(tUser.email, email), eq(tUser.username, loginId)))
            .limit(1);
        if (existing[0]) {
            return c.json(fail(c, new Error("email or username already exists")));
        }
        const saved = await db.transaction(async (tx) => {
            const users = await tx
                .insert(tUser)
                .values({
                provider: "local",
                providerUserId: null,
                username: loginId,
                email,
                password: await hashPassword(password),
                realName: encryptPersonalData(realName),
                phone: encryptPersonalData(phone),
                role: "user",
                status: "active",
            })
                .returning();
            const user = users[0];
            if (!user) {
                throw new Error("failed to create user");
            }
            await tx.insert(tUserRoles).values({
                userId: user.id,
                roleName: "user",
            });
            return user;
        });
        return c.json(ok({ user: toSafeUser(saved), ...(await createUserToken(saved)) }));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.post("/admin/password-reset", async (c) => {
    try {
        await requireAdminUser(c);
        const input = await readJson(c);
        const userId = readNumber(input, ["userId", "user_id", "id"]);
        const identifier = readString(input, ["identifier", "username", "email", "loginId", "login_id"]).toLowerCase();
        const requestedPassword = readString(input, [
            "newPassword",
            "new_password",
            "password",
        ]);
        if (!userId && !identifier) {
            return c.json(fail(c, new Error("userId or identifier is required")));
        }
        const password = requestedPassword || createTemporaryPassword();
        if (password.length < 8) {
            return c.json(fail(c, new Error("password must be at least 8 characters")));
        }
        const users = userId
            ? await db.select().from(tUser).where(eq(tUser.id, userId)).limit(1)
            : await db
                .select()
                .from(tUser)
                .where(or(eq(tUser.email, identifier), eq(tUser.username, identifier)))
                .limit(1);
        const user = users[0];
        if (!user) {
            return c.json(fail(c, new Error("user not found")));
        }
        const updatedRows = await db
            .update(tUser)
            .set({
            password: await hashPassword(password),
            updatedAt: new Date().toISOString(),
        })
            .where(eq(tUser.id, user.id))
            .returning();
        const updatedUser = updatedRows[0] ?? user;
        return c.json(ok({
            user: toSafeUser(updatedUser),
            temporaryPassword: requestedPassword ? null : password,
        }));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.get("/admin/users", async (c) => {
    try {
        await requireAdminUser(c);
        const q = String(c.req.query("q") ?? "").trim().toLowerCase();
        const parsedLimit = Number(c.req.query("limit") ?? 50);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(Math.floor(parsedLimit), 1), 100)
            : 50;
        const parsedId = Number(q);
        const where = q
            ? Number.isFinite(parsedId) && parsedId > 0
                ? or(eq(tUser.id, Math.floor(parsedId)), ilike(tUser.email, `%${q}%`), ilike(tUser.username, `%${q}%`))
                : or(ilike(tUser.email, `%${q}%`), ilike(tUser.username, `%${q}%`))
            : undefined;
        const users = await db
            .select()
            .from(tUser)
            .where(where)
            .orderBy(desc(tUser.createdAt), desc(tUser.id))
            .limit(limit);
        return c.json(ok(users.map((user) => toSafeUser(user))));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.post("/login", async (c) => {
    try {
        const input = await readJson(c);
        const identifier = readString(input, ["identifier", "username", "email", "loginId", "login_id"]).toLowerCase();
        const password = readString(input, ["password"]);
        if (!identifier || !password) {
            return c.json(fail(c, new Error("identifier and password are required")));
        }
        const rows = await db
            .select()
            .from(tUser)
            .where(or(eq(tUser.email, identifier), eq(tUser.username, identifier)))
            .limit(1);
        const user = rows[0];
        if (!user || user.status !== "active") {
            return c.json(fail(c, new Error("invalid credentials")));
        }
        const isValid = await verifyPassword(password, user.password ?? null);
        if (!isValid) {
            return c.json(fail(c, new Error("invalid credentials")));
        }
        const updatedRows = await db
            .update(tUser)
            .set({
            lastLoginAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })
            .where(eq(tUser.id, user.id))
            .returning();
        const savedUser = updatedRows[0] ?? user;
        return c.json(ok({ user: toSafeUser(savedUser), ...(await createUserToken(savedUser)) }));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.post("/password-reset/request", async (c) => {
    try {
        const input = await readJson(c);
        const email = readString(input, ["email"]).toLowerCase();
        if (!email) {
            return c.json(fail(c, new Error("email is required")));
        }
        const rows = await db
            .select()
            .from(tUser)
            .where(eq(tUser.email, email))
            .limit(1);
        const user = rows[0];
        if (user && user.status === "active") {
            const temporaryPassword = createTemporaryPassword();
            await db
                .update(tUser)
                .set({
                password: await hashPassword(temporaryPassword),
                updatedAt: new Date().toISOString(),
            })
                .where(eq(tUser.id, user.id));
            await sendPasswordResetEmail({
                to: email,
                temporaryPassword,
            });
        }
        return c.json(ok(null, "temporary password email sent"));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
router.get("/me", async (c) => {
    try {
        const user = await verifyUserToken(c.req.header("authorization") ?? "");
        return c.json(ok(toSafeUser(user)));
    }
    catch (error) {
        return c.json(fail(c, error));
    }
});
export default router;
