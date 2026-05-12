import { Hono, type Context } from "hono";
import { eq, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { tUser, tUserRoles } from "../db/schema.js";
import {
  createUserToken,
  createTemporaryPassword,
  encryptPersonalData,
  hashPassword,
  sendPasswordResetEmail,
  toSafeUser,
  verifyPassword,
  verifyUserToken,
} from "../utils/auth_utils.js";

const router = new Hono();
const MODULE_NAME = "user_router";

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

const readJson = async (c: Context) => {
  try {
    return await c.req.json<Record<string, unknown>>();
  } catch {
    return {};
  }
};

const readString = (
  input: Record<string, unknown>,
  names: string[],
  fallback = ""
) => {
  for (const name of names) {
    const value = input[name];
    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return fallback;
};

router.post("/register", async (c) => {
  try {
    const input = await readJson(c);
    const username = readString(input, ["username", "loginId", "login_id"]).toLowerCase();
    const email = readString(input, ["email"]).toLowerCase();
    const password = readString(input, ["password"]);
    const name = readString(input, ["name", "realName", "real_name"]);
    const phone = readString(input, ["phone"]);

    if (!email) {
      return c.json(fail(c, new Error("email is required")));
    }
    if (!password || password.length < 8) {
      return c.json(fail(c, new Error("password must be at least 8 characters")));
    }
    if (!name) {
      return c.json(fail(c, new Error("name is required")));
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
          name: encryptPersonalData(name),
          realName: encryptPersonalData(name),
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    return c.json(fail(c, error));
  }
});
router.get("/me", async (c) => {
  try {
    const user = await verifyUserToken(c.req.header("authorization") ?? "");
    return c.json(ok(toSafeUser(user)));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

export default router;
