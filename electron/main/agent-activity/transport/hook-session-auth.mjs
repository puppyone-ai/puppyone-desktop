import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function createHookSessionAuth({ now = Date.now } = {}) {
  const sessions = new Map();

  function issue({ terminalSessionId, providerId, ttlMs = 12 * 60 * 60 * 1000 }) {
    revoke(terminalSessionId);
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    sessions.set(terminalSessionId, Object.freeze({
      terminalSessionId,
      providerId,
      tokenDigest: digestToken(token),
      expiresAt: now() + ttlMs,
    }));
    return token;
  }

  function verify({ terminalSessionId, providerId, token }) {
    if (typeof token !== "string" || token.length < 32 || token.length > 128) return false;
    const session = sessions.get(terminalSessionId);
    if (!session || (session.providerId !== "*" && session.providerId !== providerId) || session.expiresAt <= now()) {
      if (session?.expiresAt <= now()) sessions.delete(terminalSessionId);
      return false;
    }
    const actual = digestToken(token);
    return actual.length === session.tokenDigest.length
      && timingSafeEqual(actual, session.tokenDigest);
  }

  function revoke(terminalSessionId) {
    return sessions.delete(terminalSessionId);
  }

  return Object.freeze({ issue, verify, revoke, clear: () => sessions.clear() });
}

function digestToken(token) {
  return createHash("sha256").update(token, "utf8").digest();
}
