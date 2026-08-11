import { Hono, type Context } from "hono";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { tInquiries, tInquiryReplies, tUser } from "../db/schema.js";
import {
  isStaffOrAdminUser,
  toSafeUser,
  verifyUserToken,
} from "../utils/auth_utils.js";

const router = new Hono();
const MODULE_NAME = "inquiry_router";

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

const requireStaffUser = async (c: Context) => {
  const user = await verifyUserToken(c.req.header("authorization") ?? "");
  if (await isStaffOrAdminUser(user)) {
    return user;
  }

  throw new Error("staff or admin permission is required");
};

const getOptionalUser = async (c: Context) => {
  try {
    return await verifyUserToken(c.req.header("authorization") ?? "");
  } catch {
    return null;
  }
};

const canAccessInquiry = async (c: Context, inquiryUserId: number | null) => {
  const user = await getOptionalUser(c);
  if (!user) {
    return false;
  }
  if ((await isStaffOrAdminUser(user)) || user.id === inquiryUserId) {
    return true;
  }
  return false;
};

const safeInquiry = (
  inquiry: typeof tInquiries.$inferSelect,
  user: typeof tUser.$inferSelect | null = null
) => ({
  ...inquiry,
  user: user ? toSafeUser(user) : null,
});

const getInquiryUser = async (userId: number) =>
  (await db.select().from(tUser).where(eq(tUser.id, userId)).limit(1))[0] ?? null;

const safeInquiryReply = (reply: typeof tInquiryReplies.$inferSelect) => reply;

const getInquiryReplies = async (inquiryId: number) => {
  const rows = await db
    .select()
    .from(tInquiryReplies)
    .where(eq(tInquiryReplies.inquiryId, inquiryId))
    .orderBy(asc(tInquiryReplies.createdAt), asc(tInquiryReplies.id));

  return rows.map(safeInquiryReply);
};

const safeInquiryWithReplies = async (inquiry: typeof tInquiries.$inferSelect) => ({
  ...safeInquiry(inquiry, await getInquiryUser(inquiry.userId)),
  replies: await getInquiryReplies(inquiry.id),
});

router.get("/", async (c) => {
  try {
    await requireStaffUser(c);

    const q = String(c.req.query("q") ?? "").trim();
    const parsedLimit = Number(c.req.query("limit") ?? 100);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.floor(parsedLimit), 1), 200)
      : 100;
    const where = [
      q
        ? or(
            ilike(tInquiries.title, `%${q}%`),
            ilike(tInquiries.content, `%${q}%`),
            ilike(tUser.email, `%${q}%`)
          )
        : undefined,
    ].filter(Boolean);

    const rows = await db
      .select({ inquiry: tInquiries, user: tUser })
      .from(tInquiries)
      .innerJoin(tUser, eq(tUser.id, tInquiries.userId))
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(desc(tInquiries.createdAt), desc(tInquiries.id))
      .limit(limit);

    return c.json(ok(rows.map(({ inquiry, user }) => safeInquiry(inquiry, user))));
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

    const row = (
      await db.select().from(tInquiries).where(eq(tInquiries.id, id)).limit(1)
    )[0];
    if (!row) {
      return c.json(fail(c, new Error("inquiry not found")));
    }
    if (!(await canAccessInquiry(c, row.userId))) {
      return c.json(fail(c, new Error("permission is required")));
    }

    return c.json(ok(await safeInquiryWithReplies(row)));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.post("/", async (c) => {
  try {
    const input = await getInput(c);
    const user = await verifyUserToken(c.req.header("authorization") ?? "");
    const title = readString(input, ["title"]);
    const content = readString(input, ["content"]);

    if (!title) {
      return c.json(fail(c, new Error("title is required")));
    }
    if (!content) {
      return c.json(fail(c, new Error("content is required")));
    }

    const rows = await db
      .insert(tInquiries)
      .values({
        userId: user.id,
        title,
        content,
      })
      .returning();

    return c.json(ok(safeInquiry(rows[0], user)));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.put("/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const existing = (
      await db.select().from(tInquiries).where(eq(tInquiries.id, id)).limit(1)
    )[0];
    if (!existing) {
      return c.json(fail(c, new Error("inquiry not found")));
    }
    if (!(await canAccessInquiry(c, existing.userId))) {
      return c.json(fail(c, new Error("permission is required")));
    }

    const input = await getInput(c);
    const rows = await db
      .update(tInquiries)
      .set({
        title: readString(input, ["title"], existing.title ?? ""),
        content: readString(input, ["content"], existing.content ?? ""),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tInquiries.id, id))
      .returning();

    return c.json(ok(await safeInquiryWithReplies(rows[0])));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.patch("/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const staff = await requireStaffUser(c);
    const input = await getInput(c);
    const answer = readString(input, ["answer", "content"]);
    if (!answer) {
      return c.json(fail(c, new Error("answer is required")));
    }

    const rows = await db.transaction(async (tx) => {
      const updated = await tx
        .update(tInquiries)
        .set({
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tInquiries.id, id))
        .returning();

      if (answer && updated[0]) {
        await tx.insert(tInquiryReplies).values({
          inquiryId: id,
          userId: staff.id,
          content: answer,
        });
      }

      return updated;
    });

    if (!rows[0]) {
      return c.json(fail(c, new Error("inquiry not found")));
    }

    return c.json(ok(await safeInquiryWithReplies(rows[0])));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.post("/:id/answer", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const staff = await requireStaffUser(c);
    const input = await getInput(c);
    const answer = readString(input, ["answer", "content"]);
    if (!answer) {
      return c.json(fail(c, new Error("answer is required")));
    }

    const rows = await db.transaction(async (tx) => {
      const updated = await tx
        .update(tInquiries)
        .set({
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tInquiries.id, id))
        .returning();

      if (updated[0]) {
        await tx.insert(tInquiryReplies).values({
          inquiryId: id,
          userId: staff.id,
          content: answer,
        });
      }

      return updated;
    });

    if (!rows[0]) {
      return c.json(fail(c, new Error("inquiry not found")));
    }

    return c.json(ok(await safeInquiryWithReplies(rows[0])));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.get("/:id/replies", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const inquiry = (
      await db.select().from(tInquiries).where(eq(tInquiries.id, id)).limit(1)
    )[0];
    if (!inquiry) {
      return c.json(fail(c, new Error("inquiry not found")));
    }
    if (!(await canAccessInquiry(c, inquiry.userId))) {
      return c.json(fail(c, new Error("permission is required")));
    }

    return c.json(ok(await getInquiryReplies(id)));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.post("/:id/replies", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const inquiry = (
      await db.select().from(tInquiries).where(eq(tInquiries.id, id)).limit(1)
    )[0];
    if (!inquiry) {
      return c.json(fail(c, new Error("inquiry not found")));
    }

    const user = await getOptionalUser(c);
    if (!(await canAccessInquiry(c, inquiry.userId))) {
      return c.json(fail(c, new Error("permission is required")));
    }

    const input = await getInput(c);
    const content = readString(input, ["content", "answer", "message"]);
    if (!content) {
      return c.json(fail(c, new Error("content is required")));
    }

    const saved = await db.transaction(async (tx) => {
      const reply = (
        await tx
          .insert(tInquiryReplies)
          .values({
            inquiryId: id,
            userId: user?.id ?? null,
            content,
          })
          .returning()
      )[0];

      await tx.update(tInquiries).set({ updatedAt: new Date().toISOString() }).where(eq(tInquiries.id, id));

      return reply;
    });

    return c.json(ok(safeInquiryReply(saved)));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.delete("/:id/replies/:replyId", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    const replyId = Number(c.req.param("replyId"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }
    if (!Number.isFinite(replyId) || replyId <= 0) {
      return c.json(fail(c, new Error("valid replyId is required")));
    }

    const inquiry = (
      await db.select().from(tInquiries).where(eq(tInquiries.id, id)).limit(1)
    )[0];
    if (!inquiry) {
      return c.json(fail(c, new Error("inquiry not found")));
    }

    const user = await getOptionalUser(c);
    const staff = await isStaffOrAdminUser(user);
    const reply = (
      await db
        .select()
        .from(tInquiryReplies)
        .where(
          and(
            eq(tInquiryReplies.id, replyId),
            eq(tInquiryReplies.inquiryId, id)
          )
        )
        .limit(1)
    )[0];
    if (!reply) {
      return c.json(fail(c, new Error("reply not found")));
    }
    if (!staff && (!user || reply.userId !== user.id)) {
      return c.json(fail(c, new Error("permission is required")));
    }

    const rows = await db
      .delete(tInquiryReplies)
      .where(eq(tInquiryReplies.id, replyId))
      .returning();

    return c.json(ok(safeInquiryReply(rows[0])));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

router.delete("/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json(fail(c, new Error("valid id is required")));
    }

    const existing = (
      await db.select().from(tInquiries).where(eq(tInquiries.id, id)).limit(1)
    )[0];
    if (!existing) {
      return c.json(fail(c, new Error("inquiry not found")));
    }
    if (!(await canAccessInquiry(c, existing.userId))) {
      return c.json(fail(c, new Error("permission is required")));
    }

    const response = await safeInquiryWithReplies(existing);
    const rows = await db
      .delete(tInquiries)
      .where(eq(tInquiries.id, id))
      .returning();

    if (!rows[0]) {
      return c.json(fail(c, new Error("inquiry not found")));
    }

    return c.json(ok(response));
  } catch (error) {
    return c.json(fail(c, error));
  }
});

export default router;
