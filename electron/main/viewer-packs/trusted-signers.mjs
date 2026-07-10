/**
 * Production Viewer Pack trust roots.
 *
 * Only public keys belong here. Release engineering must add a signer through a
 * reviewed source change so the key ring is covered by the application's own
 * code signature. Runtime environment variables are deliberately not a
 * production trust source.
 *
 * Shape:
 *   { keyId: "puppyone-release-2026-01", publisher: "puppyone",
 *     publicKeyPem: "-----BEGIN PUBLIC KEY-----..." }
 */
export const VIEWER_PACK_TRUSTED_SIGNERS = Object.freeze([]);
