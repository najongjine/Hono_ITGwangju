import { Hono, type Context } from "hono";
import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  tApply,
  tCourseSessions,
  tCourses,
  tEnrollments,
  tUser,
  tUserRoles,
} from "../db/schema.js";
import {
  createUserToken,
  createTemporaryPassword,
  encryptPersonalData,
  hashPassword,
  isAdminUser,
  sendPasswordResetEmail,
  toSafeUser,
  verifyPassword,
  verifyUserToken,
  withUserRoles,
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

const readNumber = (input: Record<string, unknown>, names: string[]) => {
  const value = Number(readString(input, names));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
};

const readOptionalString = (input: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(input, name)) {
      const value = input[name];
      return value === undefined || value === null ? "" : String(value).trim();
    }
  }

  return undefined;
};

const normalizeEnrollmentStatus = (value: unknown, fallback = "pending") => {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }

  const aliases = new Map([
    ["이수", "completed"],
    ["수료", "completed"],
    ["completed", "completed"],
    ["complete", "completed"],
    ["pass", "completed"],
    ["탈락", "rejected"],
    ["불합격", "rejected"],
    ["rejected", "rejected"],
    ["reject", "rejected"],
    ["failed", "rejected"],
    ["미선발", "pending"],
    ["대기", "pending"],
    ["pending", "pending"],
    ["wait", "pending"],
    ["waiting", "pending"],
    ["선발", "approved"],
    ["승인", "approved"],
    ["approved", "approved"],
    ["approve", "approved"],
  ]);

  const normalized = aliases.get(text.toLowerCase()) ?? aliases.get(text);
  if (!normalized) {
    throw new Error("status must be one of: 이수, 탈락, 미선발");
  }

  return normalized;
};

const toEnrollmentStatusLabel = (status: string | null | undefined) => {
  const normalized = normalizeEnrollmentStatus(status, "pending");
  if (normalized === "completed") return "이수";
  if (normalized === "rejected") return "탈락";
  if (normalized === "approved") return "선발";
  return "미선발";
};

const getAdminUserDetail = async (userId: number) => {
  const userRows = await db.select().from(tUser).where(eq(tUser.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    return null;
  }

  const rows = await db
    .select({
      enrollment: tEnrollments,
      course: tCourses,
      session: tCourseSessions,
      apply: tApply,
    })
    .from(tEnrollments)
    .leftJoin(tCourses, eq(tCourses.id, tEnrollments.courseId))
    .leftJoin(tCourseSessions, eq(tCourseSessions.id, tEnrollments.sessionId))
    .leftJoin(tApply, eq(tApply.enrollmentId, tEnrollments.id))
    .where(eq(tEnrollments.userId, userId))
    .orderBy(desc(tEnrollments.appliedAt), desc(tEnrollments.id));

  const enrollments = rows.map(({ enrollment, course, session, apply }) => ({
    ...enrollment,
    statusLabel: toEnrollmentStatusLabel(enrollment.approvalStatus),
    course,
    session,
    apply,
  }));

  const profileApply =
    rows.find(({ apply }) => apply?.address || apply?.detailAddress)?.apply ?? rows[0]?.apply ?? null;

  return {
    user: toSafeUser(await withUserRoles(user)),
    profile: {
      address: profileApply?.address ?? "",
      detailAddress: profileApply?.detailAddress ?? "",
      birthDate: profileApply?.birthDate ?? null,
      gender: profileApply?.gender ?? "",
      currentJob: profileApply?.currentJob ?? "",
      educationLevel: profileApply?.educationLevel ?? "",
    },
    enrollments,
  };
};

const requireAdminUser = async (c: Context) => {
  const user = await verifyUserToken(c.req.header("authorization") ?? "");
  if (await isAdminUser(user)) {
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

    const userWithRoles = await withUserRoles(saved);
    return c.json(ok({ user: toSafeUser(userWithRoles), ...(await createUserToken(userWithRoles)) }));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.post("/admin/password-reset", async (c) => {
  try {
    await requireAdminUser(c);

    const input = await readJson(c);
    const userId = readNumber(input, ["userId", "user_id", "id"]);
    const identifier = readString(
      input,
      ["identifier", "username", "email", "loginId", "login_id"]
    ).toLowerCase();
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

    return c.json(
      ok({
        user: toSafeUser(await withUserRoles(updatedUser)),
        temporaryPassword: requestedPassword ? null : password,
      })
    );
  } catch (error) {
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
        ? or(
            eq(tUser.id, Math.floor(parsedId)),
            ilike(tUser.email, `%${q}%`),
            ilike(tUser.username, `%${q}%`)
          )
        : or(ilike(tUser.email, `%${q}%`), ilike(tUser.username, `%${q}%`))
      : undefined;

    const users = await db
      .select()
      .from(tUser)
      .where(where)
      .orderBy(desc(tUser.createdAt), desc(tUser.id))
      .limit(limit);

    return c.json(ok(await Promise.all(users.map(async (user) => toSafeUser(await withUserRoles(user))))));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.get("/admin/users/:id", async (c) => {
  try {
    await requireAdminUser(c);

    const userId = Number(c.req.param("id"));
    if (!Number.isFinite(userId) || userId <= 0) {
      return c.json(fail(c, new Error("valid user id is required")));
    }

    const detail = await getAdminUserDetail(Math.floor(userId));
    if (!detail) {
      return c.json(fail(c, new Error("user not found")));
    }

    return c.json(ok(detail));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.post("/admin/users/:id", async (c) => {
  try {
    await requireAdminUser(c);

    const userId = Number(c.req.param("id"));
    if (!Number.isFinite(userId) || userId <= 0) {
      return c.json(fail(c, new Error("valid user id is required")));
    }

    const input = await readJson(c);
    const currentRows = await db.select().from(tUser).where(eq(tUser.id, Math.floor(userId))).limit(1);
    const current = currentRows[0];
    if (!current) {
      return c.json(fail(c, new Error("user not found")));
    }

    const email = readOptionalString(input, ["email"])?.toLowerCase();
    const username = readOptionalString(input, ["username", "loginId", "login_id"])?.toLowerCase();
    const realName = readOptionalString(input, ["realName", "real_name", "name"]);
    const phone = readOptionalString(input, ["phone"]);
    const status = readOptionalString(input, ["status"]);
    const profileImageUrl = readOptionalString(input, ["profileImageUrl", "profile_image_url"]);

    if (email) {
      const existing = await db
        .select({ id: tUser.id })
        .from(tUser)
        .where(and(eq(tUser.email, email), ne(tUser.id, current.id)))
        .limit(1);
      if (existing[0] && existing[0].id !== current.id) {
        return c.json(fail(c, new Error("email already exists")));
      }
    }

    const updatedRows = await db
      .update(tUser)
      .set({
        ...(email !== undefined ? { email } : {}),
        ...(username !== undefined ? { username } : {}),
        ...(realName !== undefined ? { realName: encryptPersonalData(realName) } : {}),
        ...(phone !== undefined ? { phone: encryptPersonalData(phone) } : {}),
        ...(status !== undefined ? { status: status || "active" } : {}),
        ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tUser.id, current.id))
      .returning();

    return c.json(ok(toSafeUser(await withUserRoles(updatedRows[0] ?? current))));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.post("/admin/users/:id/password-reset", async (c) => {
  try {
    await requireAdminUser(c);

    const userId = Number(c.req.param("id"));
    if (!Number.isFinite(userId) || userId <= 0) {
      return c.json(fail(c, new Error("valid user id is required")));
    }

    const input = await readJson(c);
    const requestedPassword = readString(input, ["newPassword", "new_password", "password"]);
    const password = requestedPassword || createTemporaryPassword();
    if (password.length < 8) {
      return c.json(fail(c, new Error("password must be at least 8 characters")));
    }

    const rows = await db
      .update(tUser)
      .set({
        password: await hashPassword(password),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tUser.id, Math.floor(userId)))
      .returning();
    if (!rows[0]) {
      return c.json(fail(c, new Error("user not found")));
    }

    return c.json(
      ok({
        user: toSafeUser(await withUserRoles(rows[0])),
        temporaryPassword: requestedPassword ? null : password,
      })
    );
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.post("/admin/enrollments/:id", async (c) => {
  try {
    await requireAdminUser(c);

    const enrollmentId = Number(c.req.param("id"));
    if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
      return c.json(fail(c, new Error("valid enrollment id is required")));
    }

    const input = await readJson(c);
    const courseId = readNumber(input, ["courseId", "course_id"]);
    const sessionId = readNumber(input, ["sessionId", "session_id"]);
    const status = readOptionalString(input, ["status", "approvalStatus", "approval_status"]);
    const memo = readOptionalString(input, ["memo"]);

    const existingRows = await db
      .select()
      .from(tEnrollments)
      .where(eq(tEnrollments.id, Math.floor(enrollmentId)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      return c.json(fail(c, new Error("enrollment not found")));
    }

    const nextCourseId = courseId ?? existing.courseId;
    const nextSessionId = sessionId ?? existing.sessionId;
    if (courseId || sessionId) {
      const sessionRows = await db
        .select({ id: tCourseSessions.id })
        .from(tCourseSessions)
        .where(
          and(
            eq(tCourseSessions.id, nextSessionId),
            eq(tCourseSessions.courseId, nextCourseId)
          )
        )
        .limit(1);
      if (!sessionRows[0]) {
        return c.json(fail(c, new Error("course session not found")));
      }
    }

    const updatedRows = await db
      .update(tEnrollments)
      .set({
        courseId: nextCourseId,
        sessionId: nextSessionId,
        ...(status !== undefined
          ? { approvalStatus: normalizeEnrollmentStatus(status, existing.approvalStatus) }
          : {}),
        ...(memo !== undefined ? { memo } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tEnrollments.id, existing.id))
      .returning();

    return c.json(
      ok({
        ...updatedRows[0],
        statusLabel: toEnrollmentStatusLabel(updatedRows[0]?.approvalStatus),
      })
    );
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
    const userWithRoles = await withUserRoles(savedUser);

    return c.json(ok({ user: toSafeUser(userWithRoles), ...(await createUserToken(userWithRoles)) }));
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
