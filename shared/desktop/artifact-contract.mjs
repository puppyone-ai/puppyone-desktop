import { assertDesktopTarget } from "./platform-contract.mjs";

export const DESKTOP_ARTIFACT_KINDS = Object.freeze([
  "dmg",
  "zip",
  "nsis",
  "appimage",
  "deb",
  "rpm",
  "blockmap",
  "updater-metadata",
  "terminal-preview",
]);

export function createDesktopArtifactDescriptor({
  target,
  kind,
  updateTrack,
  name,
  bytes,
  sha256,
  security,
}) {
  const normalizedTarget = assertDesktopTarget(target);
  if (!DESKTOP_ARTIFACT_KINDS.includes(kind)) {
    throw new Error(`Unsupported Desktop artifact kind: ${String(kind)}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(name ?? ""))) {
    throw new Error("Desktop artifact name must be a safe filename.");
  }
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error("Desktop artifact bytes must be a non-negative safe integer.");
  }
  if (!/^[a-f0-9]{64}$/.test(String(sha256 ?? ""))) {
    throw new Error("Desktop artifact sha256 must be a lowercase SHA-256 digest.");
  }
  return deepFreeze({
    platform: normalizedTarget.platform,
    arch: normalizedTarget.arch,
    kind,
    updateTrack,
    name,
    bytes,
    sha256,
    security: assertArtifactSecurity(security, normalizedTarget.platform),
  });
}

export function assertArtifactSecurity(value, platform) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Desktop artifact security evidence must be an object.");
  }
  const expectedKind = platform === "macos"
    ? "apple"
    : platform === "windows"
      ? "authenticode"
      : "linux";
  if (value.kind !== expectedKind) {
    throw new Error(`${platform} artifacts require ${expectedKind} security evidence.`);
  }
  if (expectedKind === "apple") {
    return deepFreeze({
      kind: "apple",
      signed: value.signed === true,
      notarized: value.notarized === true,
      stapled: value.stapled === true,
    });
  }
  if (expectedKind === "authenticode") {
    return deepFreeze({
      kind: "authenticode",
      signed: value.signed === true,
      timestamped: value.timestamped === true,
      publisherNames: Object.freeze(normalizePublisherNames(value.publisherNames)),
      digestAlgorithm: "sha256",
    });
  }
  return deepFreeze({
    kind: "linux",
    provenanceAttested: value.provenanceAttested === true,
    packageSignature: normalizeOptionalString(value.packageSignature),
    repositorySignature: normalizeOptionalString(value.repositorySignature),
  });
}

function normalizePublisherNames(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeOptionalString).filter(Boolean))].sort();
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
