import crypto from "node:crypto";

export function signOnlyOfficeJwt(payload, secret, options = {}) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("ONLYOFFICE JWT secret must contain at least 16 characters.");
  }
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + (options.ttlSeconds ?? 1800),
  };
  const encodedHeader = encodeJson({ alg: "HS256", typ: "JWT" });
  const encodedPayload = encodeJson(body);
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${signature}`;
}

export function verifyOnlyOfficeJwt(token, secret) {
  if (typeof token !== "string" || token.length > 64_000) throw new Error("Invalid callback token.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid callback token.");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson(headerPart);
  if (header?.alg !== "HS256") throw new Error("Unsupported callback token algorithm.");
  const expected = crypto.createHmac("sha256", secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  let actual;
  try {
    actual = Buffer.from(signaturePart, "base64url");
  } catch {
    throw new Error("Invalid callback token.");
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Invalid callback token signature.");
  }
  const payload = decodeJson(payloadPart);
  const now = Math.floor(Date.now() / 1000);
  if (Number.isFinite(payload?.exp) && payload.exp < now - 30) throw new Error("Callback token expired.");
  return payload;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid callback token payload.");
  }
}
