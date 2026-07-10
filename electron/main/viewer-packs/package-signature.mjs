import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as signEd25519,
  verify as verifyEd25519,
} from "node:crypto";
import { VIEWER_PACK_TRUSTED_SIGNERS } from "./trusted-signers.mjs";

/**
 * Viewer Pack package signature helpers (Ed25519).
 *
 * A detached JSON envelope carries the key id, publisher and package digest.
 * Production trust roots are compiled into the signed application. Development
 * test keys are accepted only when BOTH `allowTestKeys` is true and the app is
 * not packaged.
 */

export const VIEWER_PACK_SIGNATURE_ALGORITHM = "Ed25519";
export const VIEWER_PACK_SIGNATURE_SCHEMA_VERSION = 1;

const KEY_ID_RE = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const PUBLISHER_RE = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

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

export function createPackageSignatureEnvelope({
  privateKeyPem,
  payloadBytes,
  keyId,
  publisher,
}) {
  if (!KEY_ID_RE.test(String(keyId ?? ""))) {
    throw new TypeError("Viewer Pack signing key id is invalid.");
  }
  if (!PUBLISHER_RE.test(String(publisher ?? ""))) {
    throw new TypeError("Viewer Pack signing publisher is invalid.");
  }
  const bytes = Buffer.from(payloadBytes);
  return Object.freeze({
    schemaVersion: VIEWER_PACK_SIGNATURE_SCHEMA_VERSION,
    algorithm: VIEWER_PACK_SIGNATURE_ALGORITHM,
    keyId,
    publisher,
    packageSha256: sha256Hex(bytes),
    signature: signPayload(privateKeyPem, bytes),
  });
}

export function serializePackageSignatureEnvelope(envelope) {
  const parsed = parsePackageSignatureEnvelope(envelope);
  if (!parsed.ok) throw new TypeError(`Invalid Viewer Pack signature envelope (${parsed.reason}).`);
  return `${JSON.stringify(parsed.value, null, 2)}\n`;
}

export function parsePackageSignatureEnvelope(input) {
  let raw = input;
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    raw = Buffer.from(input).toString("utf8");
  }
  if (typeof raw === "string") {
    if (Buffer.byteLength(raw, "utf8") > 16 * 1024) {
      return { ok: false, reason: "envelope-too-large" };
    }
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "envelope-json-invalid" };
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "envelope-invalid" };
  }
  const allowedKeys = new Set([
    "schemaVersion",
    "algorithm",
    "keyId",
    "publisher",
    "packageSha256",
    "signature",
  ]);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    return { ok: false, reason: "envelope-unknown-fields" };
  }
  if (raw.schemaVersion !== VIEWER_PACK_SIGNATURE_SCHEMA_VERSION) {
    return { ok: false, reason: "envelope-schema-unsupported" };
  }
  if (raw.algorithm !== VIEWER_PACK_SIGNATURE_ALGORITHM) {
    return { ok: false, reason: "envelope-algorithm-unsupported" };
  }
  if (!KEY_ID_RE.test(String(raw.keyId ?? ""))) {
    return { ok: false, reason: "envelope-key-id-invalid" };
  }
  if (!PUBLISHER_RE.test(String(raw.publisher ?? ""))) {
    return { ok: false, reason: "envelope-publisher-invalid" };
  }
  if (!SHA256_RE.test(String(raw.packageSha256 ?? ""))) {
    return { ok: false, reason: "envelope-sha256-invalid" };
  }
  if (typeof raw.signature !== "string" || !/^[A-Za-z0-9_-]{80,128}$/.test(raw.signature)) {
    return { ok: false, reason: "envelope-signature-invalid" };
  }
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIEWER_PACK_SIGNATURE_SCHEMA_VERSION,
      algorithm: VIEWER_PACK_SIGNATURE_ALGORITHM,
      keyId: raw.keyId,
      publisher: raw.publisher,
      packageSha256: raw.packageSha256,
      signature: raw.signature,
    }),
  };
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

export function verifyPackageSignature({
  payloadBytes,
  signatureEnvelope,
  trustedSigners,
}) {
  const parsed = parsePackageSignatureEnvelope(signatureEnvelope);
  if (!parsed.ok) return parsed;
  const envelope = parsed.value;
  const bytes = Buffer.from(payloadBytes);
  if (sha256Hex(bytes) !== envelope.packageSha256) {
    return { ok: false, reason: "package-sha256-mismatch" };
  }

  const signers = normalizeTrustedSigners(trustedSigners);
  if (signers.length === 0) {
    return { ok: false, reason: "no-trusted-signers" };
  }
  const signer = signers.find((candidate) => candidate.keyId === envelope.keyId);
  if (!signer) return { ok: false, reason: "signer-not-trusted" };
  if (signer.publisher !== envelope.publisher) {
    return { ok: false, reason: "signer-publisher-mismatch" };
  }
  const verified = verifyPackageEnvelope({
    payloadBytes: bytes,
    signatureBase64Url: envelope.signature,
    publicKeyPem: signer.publicKeyPem,
  });
  if (!verified.ok) return verified;
  return { ok: true, signer, envelope };
}

export function getPinnedViewerPackSigners({
  env = process.env,
  embeddedSigners = VIEWER_PACK_TRUSTED_SIGNERS,
  allowTestKeys = false,
  isPackaged = true,
} = {}) {
  const signers = normalizeTrustedSigners(embeddedSigners);
  if (!isPackaged && allowTestKeys && typeof env.PUPPYONE_VIEWER_PACK_TEST_PUBLIC_KEY === "string") {
    const testSigner = {
      keyId: env.PUPPYONE_VIEWER_PACK_TEST_KEY_ID ?? "puppyone-test-local",
      publisher: env.PUPPYONE_VIEWER_PACK_TEST_PUBLISHER ?? "puppyone-test",
      publicKeyPem: env.PUPPYONE_VIEWER_PACK_TEST_PUBLIC_KEY,
    };
    return normalizeTrustedSigners([...signers, testSigner]);
  }
  return signers;
}

export function normalizeTrustedSigners(input) {
  const signers = [];
  const seen = new Set();
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof raw !== "object") continue;
    const keyId = String(raw.keyId ?? "");
    const publisher = String(raw.publisher ?? "");
    const publicKeyPem = String(raw.publicKeyPem ?? "");
    if (!KEY_ID_RE.test(keyId) || !PUBLISHER_RE.test(publisher)) continue;
    if (!publicKeyPem.includes("BEGIN PUBLIC KEY") || seen.has(keyId)) continue;
    try {
      createPublicKey(publicKeyPem);
    } catch {
      continue;
    }
    seen.add(keyId);
    signers.push(Object.freeze({ keyId, publisher, publicKeyPem }));
  }
  return Object.freeze(signers);
}
