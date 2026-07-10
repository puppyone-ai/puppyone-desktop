import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as signEd25519,
  verify as verifyEd25519,
} from "node:crypto";

/**
 * Viewer Pack package signature helpers (Ed25519).
 * Production pins PuppyOne public keys via env/config. Tests use generateTestKeyPair().
 */

export const VIEWER_PACK_SIGNATURE_ALGORITHM = "Ed25519";

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function generateTestKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signPayload(privateKeyPem, payloadBytes) {
  const key = createPrivateKey(privateKeyPem);
  const signature = signEd25519(null, Buffer.from(payloadBytes), key);
  return signature.toString("base64url");
}

export function verifyPackageEnvelope({
  payloadBytes,
  signatureBase64Url,
  publicKeyPem,
}) {
  if (!Buffer.isBuffer(payloadBytes) && !(payloadBytes instanceof Uint8Array)) {
    return { ok: false, reason: "invalid-payload" };
  }
  if (typeof signatureBase64Url !== "string" || !signatureBase64Url) {
    return { ok: false, reason: "missing-signature" };
  }
  if (typeof publicKeyPem !== "string" || !publicKeyPem.includes("BEGIN PUBLIC KEY")) {
    return { ok: false, reason: "missing-public-key" };
  }

  try {
    const key = createPublicKey(publicKeyPem);
    const signature = Buffer.from(signatureBase64Url, "base64url");
    const ok = verifyEd25519(null, Buffer.from(payloadBytes), key, signature);
    return ok ? { ok: true } : { ok: false, reason: "signature-mismatch" };
  } catch {
    return { ok: false, reason: "signature-verify-error" };
  }
}

export function verifyAgainstPinnedKeys({
  payloadBytes,
  signatureBase64Url,
  publicKeys,
}) {
  const keys = Array.isArray(publicKeys) ? publicKeys : [];
  if (keys.length === 0) {
    return { ok: false, reason: "no-pinned-keys" };
  }
  for (const publicKeyPem of keys) {
    const result = verifyPackageEnvelope({ payloadBytes, signatureBase64Url, publicKeyPem });
    if (result.ok) return result;
  }
  return { ok: false, reason: "signature-mismatch" };
}

export function getPinnedViewerPackPublicKeys({
  env = process.env,
  allowTestKeys = false,
} = {}) {
  const configured = env.PUPPYONE_VIEWER_PACK_PUBLIC_KEYS;
  if (typeof configured === "string" && configured.trim()) {
    return configured.split("||").map((item) => item.trim()).filter(Boolean);
  }
  if (allowTestKeys && typeof env.PUPPYONE_VIEWER_PACK_TEST_PUBLIC_KEY === "string") {
    return [env.PUPPYONE_VIEWER_PACK_TEST_PUBLIC_KEY];
  }
  return [];
}
