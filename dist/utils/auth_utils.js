import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual, } from "crypto";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import { Jwt } from "hono/utils/jwt";
import { db } from "../db/index.js";
import { tUser, tUserRoles } from "../db/schema.js";
const scrypt = promisify(scryptCallback);
const ENCRYPTED_PREFIX = "enc:v1";
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is required");
    }
    return secret;
};
const getEncryptionKey = () => {
    const secret = process.env.PERSONAL_DATA_SECRET ?? process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("PERSONAL_DATA_SECRET is required");
    }
    return createHash("sha256").update(secret).digest();
};
const getExpiresInSeconds = () => {
    const value = Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 60 * 60 * 24 * 7);
    return Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 60 * 60 * 24 * 7;
};
const toBase64Url = (value) => value.toString("base64url");
const fromBase64Url = (value) => Buffer.from(value, "base64url");
const normalizeRoles = (roles) => {
    const normalized = [
        ...new Set(roles
            .map((role) => String(role ?? "").trim())
            .filter((role) => role.length > 0)),
    ];
    return normalized.length > 0 ? normalized : ["user"];
};
const getPrimaryRole = (roles) => roles.includes("admin") ? "admin" : roles[0] ?? "user";
export const getUserRoles = async (userId) => {
    const rows = await db
        .select({ roleName: tUserRoles.roleName })
        .from(tUserRoles)
        .where(eq(tUserRoles.userId, userId));
    return normalizeRoles(rows.map((row) => row.roleName));
};
export const withUserRoles = async (user) => {
    const roles = "roles" in user ? normalizeRoles(user.roles) : await getUserRoles(user.id);
    return {
        ...user,
        roles,
        role: getPrimaryRole(roles),
    };
};
export const getUserWithRolesById = async (userId) => {
    const rows = await db
        .select({
        user: tUser,
        roleName: tUserRoles.roleName,
    })
        .from(tUser)
        .leftJoin(tUserRoles, eq(tUserRoles.userId, tUser.id))
        .where(eq(tUser.id, userId));
    const user = rows[0]?.user;
    if (!user) {
        return null;
    }
    const roles = normalizeRoles(rows.map((row) => row.roleName));
    return withUserRoles({
        ...user,
        roles,
        role: getPrimaryRole(roles),
    });
};
export const isAdminUser = async (user) => {
    if (!user) {
        return false;
    }
    const roles = "roles" in user ? normalizeRoles(user.roles ?? []) : await getUserRoles(user.id);
    return roles.includes("admin");
};
export const createTemporaryPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = randomBytes(10);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};
export const encryptPersonalData = (value) => {
    const normalized = value.trim();
    if (!normalized) {
        return "";
    }
    if (normalized.startsWith(`${ENCRYPTED_PREFIX}:`)) {
        return normalized;
    }
    const key = getEncryptionKey();
    const iv = createHmac("sha256", key).update(normalized).digest().subarray(0, 16);
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    const encrypted = Buffer.concat([
        cipher.update(normalized, "utf8"),
        cipher.final(),
    ]);
    const ivText = toBase64Url(iv);
    const encryptedText = toBase64Url(encrypted);
    const mac = createHmac("sha256", key)
        .update(`${ivText}.${encryptedText}`)
        .digest()
        .subarray(0, 16);
    return `${ENCRYPTED_PREFIX}:${ivText}:${encryptedText}:${toBase64Url(mac)}`;
};
export const decryptPersonalData = (value) => {
    if (!value) {
        return "";
    }
    if (!value.startsWith(`${ENCRYPTED_PREFIX}:`)) {
        return value;
    }
    const [, version, ivText, encryptedText, macText] = value.split(":");
    if (version !== "v1" || !ivText || !encryptedText || !macText) {
        return "";
    }
    const key = getEncryptionKey();
    const expectedMac = createHmac("sha256", key)
        .update(`${ivText}.${encryptedText}`)
        .digest()
        .subarray(0, 16);
    const actualMac = fromBase64Url(macText);
    if (actualMac.length !== expectedMac.length ||
        !timingSafeEqual(actualMac, expectedMac)) {
        return "";
    }
    const decipher = createDecipheriv("aes-256-cbc", key, fromBase64Url(ivText));
    const decrypted = Buffer.concat([
        decipher.update(fromBase64Url(encryptedText)),
        decipher.final(),
    ]);
    return decrypted.toString("utf8");
};
export const toSafeUser = (user) => {
    const { password, ...safeUser } = user;
    return {
        ...safeUser,
        realName: decryptPersonalData(safeUser.realName),
        phone: decryptPersonalData(safeUser.phone),
    };
};
export const hashPassword = async (password) => {
    const salt = randomBytes(16).toString("hex");
    const key = (await scrypt(password, salt, 64));
    return `scrypt$${salt}$${key.toString("hex")}`;
};
export const verifyPassword = async (password, storedHash) => {
    if (!storedHash) {
        return false;
    }
    const [algorithm, salt, keyHex] = storedHash.split("$");
    if (algorithm !== "scrypt" || !salt || !keyHex) {
        return false;
    }
    const storedKey = Buffer.from(keyHex, "hex");
    const candidateKey = (await scrypt(password, salt, storedKey.length));
    return (storedKey.length === candidateKey.length &&
        timingSafeEqual(storedKey, candidateKey));
};
export const createUserToken = async (user) => {
    const userWithRoles = await withUserRoles(user);
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = getExpiresInSeconds();
    const token = await Jwt.sign({
        sub: String(userWithRoles.id),
        userId: userWithRoles.id,
        email: userWithRoles.email ?? "",
        role: userWithRoles.role,
        roles: userWithRoles.roles,
        iat: now,
        exp: now + expiresIn,
    }, getJwtSecret(), "HS256");
    return {
        token,
        tokenType: "Bearer",
        expiresIn,
    };
};
const getBearerToken = (authorization = "") => {
    const [type, token] = authorization.split(" ");
    return type?.toLowerCase() === "bearer" && token ? token : "";
};
export const verifyUserToken = async (authorization = "") => {
    const token = getBearerToken(authorization);
    if (!token) {
        throw new Error("Bearer token is required");
    }
    const payload = await Jwt.verify(token, getJwtSecret(), { alg: "HS256" });
    const userId = Number(payload.sub ?? payload.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
        throw new Error("invalid token");
    }
    const user = await getUserWithRolesById(userId);
    if (!user || user.status !== "active") {
        throw new Error("user not found or inactive");
    }
    return user;
};
export const sendPasswordResetEmail = async ({ to, temporaryPassword, }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error("RESEND_API_KEY is required");
    }
    const from = process.env.MAIL_FROM ?? "ITGwangju <onboarding@resend.dev>";
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to,
            subject: "Temporary password",
            html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Temporary password</h2>
          <p>Use the temporary password below to sign in.</p>
          <p style="font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">${temporaryPassword}</p>
          <p>Please change your password after signing in.</p>
          <p>If you did not request this, contact the administrator.</p>
        </div>
      `,
            text: `Temporary password: ${temporaryPassword}\nPlease change your password after signing in.`,
        }),
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`failed to send password reset email. ${body}`);
    }
};
