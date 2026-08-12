const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 10_000;
export const verifyTurnstile = async ({ token, remoteIp, expectedAction, }) => {
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
    if (!secret) {
        throw new Error("Turnstile server configuration is missing");
    }
    const normalizedToken = token.trim();
    if (!normalizedToken || normalizedToken.length > MAX_TOKEN_LENGTH) {
        throw new Error("자동 가입 방지 확인을 완료해 주세요.");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
        const body = new URLSearchParams({
            secret,
            response: normalizedToken,
        });
        if (remoteIp) {
            body.set("remoteip", remoteIp);
        }
        const response = await fetch(SITEVERIFY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Siteverify returned HTTP ${response.status}`);
        }
        const result = (await response.json());
        if (!result.success || result.action !== expectedAction) {
            console.warn("Turnstile validation failed", {
                action: result.action ?? null,
                hostname: result.hostname ?? null,
                errorCodes: result["error-codes"] ?? [],
            });
            throw new Error("자동 가입 방지 확인에 실패했습니다. 다시 시도해 주세요.");
        }
    }
    catch (error) {
        if (error instanceof Error &&
            error.message === "자동 가입 방지 확인에 실패했습니다. 다시 시도해 주세요.") {
            throw error;
        }
        console.error("Turnstile Siteverify request failed", error instanceof Error ? error.message : String(error));
        throw new Error("자동 가입 방지 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
    finally {
        clearTimeout(timeoutId);
    }
};
