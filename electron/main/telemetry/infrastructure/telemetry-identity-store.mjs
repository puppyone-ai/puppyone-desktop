import { createHmac, randomBytes as nodeRandomBytes } from "node:crypto";
import { createAtomicJsonFile } from "./atomic-json-file.mjs";

const IDENTITY_VERSION = 1;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createTelemetryIdentityStore({
  filePath,
  fsModule,
  randomBytes = nodeRandomBytes,
}) {
  const file = createAtomicJsonFile({ filePath, fsModule });
  let cachedSecret = null;

  async function readOrCreateSecret() {
    if (cachedSecret) return cachedSecret;
    const stored = await file.read();
    if (stored?.version === IDENTITY_VERSION && SECRET_PATTERN.test(stored.secret ?? "")) {
      cachedSecret = stored.secret;
      return cachedSecret;
    }
    cachedSecret = randomBytes(32).toString("base64url");
    await file.write({ version: IDENTITY_VERSION, secret: cachedSecret });
    return cachedSecret;
  }

  return Object.freeze({
    async getMonthlyAnonymousId(value) {
      const date = value instanceof Date ? value : new Date(value);
      if (!Number.isFinite(date.getTime())) throw new TypeError("A valid identity period is required.");
      const period = date.toISOString().slice(0, 7);
      const secret = await readOrCreateSecret();
      const digest = createHmac("sha256", Buffer.from(secret, "base64url"))
        .update(`puppyone-desktop-telemetry:${period}`)
        .digest("base64url");
      return `m1_${digest}`;
    },

    async clear() {
      cachedSecret = null;
      await file.remove();
    },
  });
}
