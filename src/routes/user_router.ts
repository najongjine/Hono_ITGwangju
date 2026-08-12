import { Hono, type Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  tCourseSessions,
  tCourses,
  tEnrollments,
  tUser,
  tUserRegistermeta,
  tUserRoles,
} from "../db/schema.js";
import {
  createUserToken,
  createTemporaryPassword,
  encryptPersonalData,
  hashPassword,
  isAdminUser,
  isStaffOrAdminUser,
  sendPasswordResetEmail,
  toSafeUser,
  verifyPassword,
  verifyUserToken,
  withUserRoles,
} from "../utils/auth_utils.js";
import { verifyTurnstile } from "../utils/turnstile.js";

const router = new Hono();
const MODULE_NAME = "user_router";

const ok = (data: unknown = null, message = "") => ({
  success: true,
  data,
  code: "",
  msg: message,
});

const getApiName = (c: Context) => `${c.req.method} ${new URL(c.req.url).pathname}`;

const normalizeSignupIp = (value: string | undefined) => {
  let ip = value?.trim().replace(/^"|"$/g, "");
  if (!ip || ip.toLowerCase() === "unknown" || ip.toLowerCase() === "null") {
    return null;
  }

  if (ip.startsWith("[")) {
    ip = ip.slice(1, ip.indexOf("]") > 0 ? ip.indexOf("]") : undefined);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(":"));
  }

  if (ip.toLowerCase().startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  return ip.slice(0, 45) || null;
};

const getSignupIp = (c: Context) => {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0];
  const forwarded = c.req
    .header("forwarded")
    ?.split(",")[0]
    ?.split(";")
    .find((part) => part.trim().toLowerCase().startsWith("for="))
    ?.trim()
    .slice(4);
  const headerIp = [
    c.req.header("cf-connecting-ip"),
    c.req.header("true-client-ip"),
    forwardedFor,
    c.req.header("x-real-ip"),
    c.req.header("fly-client-ip"),
    forwarded,
  ]
    .map(normalizeSignupIp)
    .find((ip) => ip !== null);

  if (headerIp) {
    return headerIp;
  }

  try {
    return normalizeSignupIp(getConnInfo(c).remote.address);
  } catch {
    return null;
  }
};

const getSignupUserAgent = (c: Context) =>
  c.req.header("user-agent")?.trim() || null;

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
    throw new Error("status must be one of: pending, approved, rejected");
  }

  return normalized;
};

const toEnrollmentStatusLabel = (status: string | null | undefined) => {
  const normalized = normalizeEnrollmentStatus(status, "pending");
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
    })
    .from(tEnrollments)
    .leftJoin(tCourses, eq(tCourses.id, tEnrollments.courseId))
    .leftJoin(tCourseSessions, eq(tCourseSessions.id, tEnrollments.sessionId))
    .where(eq(tEnrollments.userId, userId))
    .orderBy(desc(tEnrollments.appliedAt), desc(tEnrollments.id));

  const enrollments = rows.map(({ enrollment, course, session }) => ({
    ...enrollment,
    statusLabel: toEnrollmentStatusLabel(enrollment.status),
    course,
    session,
  }));

  return {
    user: toSafeUser(await withUserRoles(user)),
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

const requireStaffUser = async (c: Context) => {
  const user = await verifyUserToken(c.req.header("authorization") ?? "");
  if (await isStaffOrAdminUser(user)) {
    return user;
  }

  throw new Error("staff or admin permission is required");
};

router.post("/register", async (c) => {
  try {
    const input = await readJson(c);
    const username = readString(input, ["username", "loginId", "login_id"]).toLowerCase();
    const email = readString(input, ["email"]).toLowerCase();
    const password = readString(input, ["password"]);
    const realName = readString(input, ["realName", "real_name", "name"]);
    const phone = readString(input, ["phone"]);
    const zipcode = readOptionalString(input, ["zipcode", "zipCode", "zip_code"]);
    const roadAddress = readOptionalString(input, ["roadAddress", "road_address"]);
    const detailAddress = readOptionalString(input, ["detailAddress", "detail_address"]);
    const turnstileToken = readString(input, [
      "turnstileToken",
      "turnstile_token",
      "cf-turnstile-response",
    ]);
    const signupIp = getSignupIp(c);
    const signupUserAgent = getSignupUserAgent(c);

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

    await verifyTurnstile({
      token: turnstileToken,
      remoteIp: signupIp,
      expectedAction: "signup",
    });

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
          zipcode: zipcode || null,
          roadAddress: roadAddress || null,
          detailAddress: detailAddress ? encryptPersonalData(detailAddress) : null,
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

      await tx.insert(tUserRegistermeta).values({
        userId: user.id,
        signupIp,
        signupUserAgent,
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
    const zipcode = readOptionalString(input, ["zipcode", "zipCode", "zip_code"]);
    const roadAddress = readOptionalString(input, ["roadAddress", "road_address"]);
    const detailAddress = readOptionalString(input, ["detailAddress", "detail_address"]);
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
        ...(zipcode !== undefined ? { zipcode: zipcode || null } : {}),
        ...(roadAddress !== undefined ? { roadAddress: roadAddress || null } : {}),
        ...(detailAddress !== undefined
          ? { detailAddress: detailAddress ? encryptPersonalData(detailAddress) : null }
          : {}),
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

const processEnrollment = async (c: Context) => {
  try {
    await requireStaffUser(c);

    const enrollmentId = Number(
      c.req.query("enrollmentId") ??
        c.req.query("enrollment_id") ??
        c.req.query("id") ??
        c.req.param("id")
    );
    if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
      return c.json(
        fail(c, new Error("valid enrollmentId query parameter is required"))
      );
    }

    const input = {
      ...(await readJson(c)),
      ...Object.fromEntries(new URL(c.req.url).searchParams.entries()),
    };
    const courseId = readNumber(input, ["courseId", "course_id"]);
    const sessionId = readNumber(input, ["sessionId", "session_id"]);
    const status = readOptionalString(input, ["status"]);
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
          ? { status: normalizeEnrollmentStatus(status, existing.status) }
          : {}),
        ...(memo !== undefined ? { memo } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tEnrollments.id, existing.id))
      .returning();

    return c.json(
      ok({
        ...updatedRows[0],
        statusLabel: toEnrollmentStatusLabel(updatedRows[0]?.status),
      })
    );
  } catch (error) {
    return c.json(fail(c, error));
  }
};

router.post("/admin/enrollments/process", processEnrollment);
router.post("/admin/enrollments/:id", processEnrollment);

router.post("/enrollments/apply", async (c) => {
  try {
    const user = await verifyUserToken(c.req.header("authorization") ?? "");
    const courseId = Number(c.req.query("courseId") ?? c.req.query("course_id"));
    const sessionId = Number(c.req.query("sessionId") ?? c.req.query("session_id"));

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return c.json(fail(c, new Error("valid courseId query parameter is required")));
    }
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return c.json(fail(c, new Error("valid sessionId query parameter is required")));
    }

    const safeUser = toSafeUser(user);
    if (!safeUser.realName || !safeUser.phone || !safeUser.email) {
      return c.json(
        fail(c, new Error("real name, phone, and email are required before applying"))
      );
    }

    const result = await db.transaction(async (tx) => {
      const course = (
        await tx
          .select()
          .from(tCourses)
          .where(and(eq(tCourses.id, courseId), ne(tCourses.status, "deleted")))
          .limit(1)
      )[0];
      if (!course || course.isVisible === false || course.status === "마감") {
        throw new Error("course is not available for application");
      }

      const session = (
        await tx
          .select()
          .from(tCourseSessions)
          .where(
            and(
              eq(tCourseSessions.id, sessionId),
              eq(tCourseSessions.courseId, courseId),
              ne(tCourseSessions.status, "deleted")
            )
          )
          .limit(1)
      )[0];
      if (!session || session.status !== "모집중") {
        throw new Error("course session is not recruiting");
      }

      const existing = (
        await tx
          .select()
          .from(tEnrollments)
          .where(
            and(
              eq(tEnrollments.userId, user.id),
              eq(tEnrollments.sessionId, sessionId)
            )
          )
          .limit(1)
      )[0];
      if (existing) {
        throw new Error("already applied to this course session");
      }

      const countRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tEnrollments)
        .where(eq(tEnrollments.sessionId, sessionId));
      const enrollmentCount = Number(countRows[0]?.count ?? 0);
      if (session.capacity !== null && enrollmentCount >= session.capacity) {
        throw new Error("course session capacity has been reached");
      }

      const now = new Date().toISOString();
      const values = {
        userId: user.id,
        courseId,
        sessionId,
        status: "pending",
        appliedAt: now,
        updatedAt: now,
      };

      const rows = await tx.insert(tEnrollments).values(values).returning();

      return rows[0];
    });

    return c.json(
      ok({
        ...result,
        statusLabel: toEnrollmentStatusLabel(result.status),
      }, "application submitted and pending approval")
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

router.patch("/me", async (c) => {
  try {
    const user = await verifyUserToken(c.req.header("authorization") ?? "");
    const input = await readJson(c);
    const realName = readOptionalString(input, ["realName", "real_name"]);
    const phone = readOptionalString(input, ["phone"]);
    const zipcode = readOptionalString(input, ["zipcode"]);
    const roadAddress = readOptionalString(input, ["roadAddress", "road_address"]);
    const detailAddress = readOptionalString(input, ["detailAddress", "detail_address"]);

    if (realName !== undefined && !realName) {
      throw new Error("real name is required");
    }
    if (phone !== undefined && !phone) {
      throw new Error("phone is required");
    }

    const values = {
      ...(realName !== undefined ? { realName: encryptPersonalData(realName) } : {}),
      ...(phone !== undefined ? { phone: encryptPersonalData(phone) } : {}),
      ...(zipcode !== undefined ? { zipcode } : {}),
      ...(roadAddress !== undefined ? { roadAddress } : {}),
      ...(detailAddress !== undefined
        ? { detailAddress: encryptPersonalData(detailAddress) }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    const rows = await db
      .update(tUser)
      .set(values)
      .where(eq(tUser.id, user.id))
      .returning();
    const updatedUser = rows[0];

    if (!updatedUser) {
      throw new Error("user not found");
    }

    return c.json(ok(toSafeUser(await withUserRoles(updatedUser)), "profile updated"));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.patch("/me/password", async (c) => {
  try {
    const user = await verifyUserToken(c.req.header("authorization") ?? "");
    const input = await readJson(c);
    const currentPassword = readString(input, ["currentPassword", "current_password"]);
    const newPassword = readString(input, ["newPassword", "new_password"]);

    if (!currentPassword || !newPassword) {
      throw new Error("현재 비밀번호와 새 비밀번호를 입력해 주세요.");
    }
    if (newPassword.length < 8) {
      throw new Error("새 비밀번호는 8자 이상 입력해 주세요.");
    }
    if (!(await verifyPassword(currentPassword, user.password ?? null))) {
      throw new Error("현재 비밀번호가 일치하지 않습니다.");
    }
    if (await verifyPassword(newPassword, user.password ?? null)) {
      throw new Error("새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.");
    }

    const rows = await db
      .update(tUser)
      .set({
        password: await hashPassword(newPassword),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tUser.id, user.id))
      .returning({ id: tUser.id });

    if (!rows[0]) {
      throw new Error("사용자 정보를 찾을 수 없습니다.");
    }

    return c.json(ok(null, "비밀번호가 변경되었습니다."));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.get("/me/enrollments", async (c) => {
  try {
    const user = await verifyUserToken(c.req.header("authorization") ?? "");
    const rows = await db
      .select({
        enrollment: tEnrollments,
        course: tCourses,
        session: tCourseSessions,
      })
      .from(tEnrollments)
      .innerJoin(tCourses, eq(tCourses.id, tEnrollments.courseId))
      .innerJoin(tCourseSessions, eq(tCourseSessions.id, tEnrollments.sessionId))
      .where(eq(tEnrollments.userId, user.id))
      .orderBy(desc(tEnrollments.appliedAt), desc(tEnrollments.id));

    return c.json(
      ok(
        rows.map(({ enrollment, course, session }) => ({
          ...enrollment,
          statusLabel: toEnrollmentStatusLabel(enrollment.status),
          course: {
            id: course.id,
            courseName: course.courseName,
          },
          session: {
            id: session.id,
            sessionName: session.sessionName,
            sessionNo: session.sessionNo,
            startDate: session.startDate,
            endDate: session.endDate,
            classStartTime: session.classStartTime,
            classEndTime: session.classEndTime,
          },
        }))
      )
    );
  } catch (error) {
    return c.json(fail(c, error));
  }
});

export default router;
