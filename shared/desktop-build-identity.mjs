import {
  DESKTOP_INTERNAL_UPDATE_FEED_URL,
  DESKTOP_STABLE_UPDATE_FEED_URL,
} from "./desktop-distribution-contract.mjs";

export const DESKTOP_BUILD_INFO_SCHEMA_VERSION = 1;
export const DESKTOP_BUILD_PRODUCT = "puppyone-desktop";
export const DESKTOP_BUILD_CHANNELS = Object.freeze(["dev", "internal", "stable"]);
export const DESKTOP_PUBLISHED_CHANNELS = Object.freeze(["internal", "stable"]);

const BASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const FULL_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const BUILD_NUMBER_PATTERN = /^[1-9]\d*$/;
const BUILD_INFO_KEYS = Object.freeze([
  "schemaVersion",
  "product",
  "channel",
  "baseVersion",
  "version",
  "buildId",
  "platformBuildNumber",
  "commitSha",
  "builtAt",
  "sourceDirty",
]);

const CHANNEL_POLICIES = deepFreeze({
  dev: {
    applicationId: "ai.puppyone.desktop.dev",
    applicationName: "PuppyOne Development",
    userDataName: "puppyone-development",
    releaseChannel: null,
    releaseAudience: "local",
    updateChannel: null,
    updateFeedUrl: null,
    published: false,
    requiresDeveloperIdSignature: false,
    requiresNotarization: false,
  },
  internal: {
    applicationId: "ai.puppyone.desktop.internal",
    applicationName: "PuppyOne Internal",
    userDataName: "puppyone-internal",
    releaseChannel: "internal",
    releaseAudience: "restricted",
    updateChannel: "internal",
    updateFeedUrl: DESKTOP_INTERNAL_UPDATE_FEED_URL,
    published: true,
    requiresDeveloperIdSignature: false,
    requiresNotarization: false,
  },
  stable: {
    applicationId: "ai.puppyone.desktop",
    applicationName: "PuppyOne",
    userDataName: "puppyone",
    releaseChannel: "stable",
    releaseAudience: "public",
    updateChannel: "stable",
    updateFeedUrl: DESKTOP_STABLE_UPDATE_FEED_URL,
    published: true,
    requiresDeveloperIdSignature: true,
    requiresNotarization: true,
  },
});

export function isDesktopBuildChannel(value) {
  return DESKTOP_BUILD_CHANNELS.includes(value);
}

export function isDesktopPublishedChannel(value) {
  return DESKTOP_PUBLISHED_CHANNELS.includes(value);
}

export function getDesktopBuildChannelPolicy(channel) {
  if (!isDesktopBuildChannel(channel)) {
    throw new Error(`Unsupported PuppyOne Desktop build channel: ${String(channel)}`);
  }
  return CHANNEL_POLICIES[channel];
}

export function resolveDesktopBuildIdentity({
  baseVersion,
  channel,
  commitSha,
  buildNumber = null,
  builtAt = new Date().toISOString(),
  sourceDirty = false,
}) {
  const normalizedBaseVersion = normalizeBaseVersion(baseVersion);
  const normalizedChannel = normalizeChannel(channel);
  const normalizedCommitSha = normalizeCommitSha(commitSha);
  const normalizedBuiltAt = normalizeTimestamp(builtAt);
  const normalizedSourceDirty = sourceDirty === true;
  const published = isDesktopPublishedChannel(normalizedChannel);

  if (published && normalizedSourceDirty) {
    throw new Error("Published PuppyOne Desktop builds require a clean source tree.");
  }

  let version;
  let buildId;
  let platformBuildNumber;

  if (normalizedChannel === "dev") {
    const shortCommit = normalizedCommitSha.slice(0, 8);
    buildId = `g${shortCommit}`;
    platformBuildNumber = null;
    version = `${normalizedBaseVersion}-dev.${buildId}${normalizedSourceDirty ? ".dirty" : ""}`;
  } else {
    const normalizedBuildNumber = normalizeBuildNumber(buildNumber);
    buildId = normalizedBuildNumber;
    platformBuildNumber = normalizedBuildNumber;
    version = normalizedChannel === "internal"
      ? `${normalizedBaseVersion}-internal.${normalizedBuildNumber}`
      : normalizedBaseVersion;
  }

  return deepFreeze({
    schemaVersion: DESKTOP_BUILD_INFO_SCHEMA_VERSION,
    product: DESKTOP_BUILD_PRODUCT,
    channel: normalizedChannel,
    baseVersion: normalizedBaseVersion,
    version,
    buildId,
    platformBuildNumber,
    commitSha: normalizedCommitSha,
    builtAt: normalizedBuiltAt,
    sourceDirty: normalizedSourceDirty,
  });
}

export function createDesktopBuildTag(buildInfo) {
  const identity = assertDesktopBuildInfo(buildInfo);
  return identity.channel === "dev" ? null : `v${identity.version}`;
}

export function createDesktopBuildReleaseName(buildInfo) {
  const identity = assertDesktopBuildInfo(buildInfo);
  if (identity.channel === "dev") return `puppyone ${identity.version}`;
  if (identity.channel === "internal") {
    return `PuppyOne ${identity.baseVersion} Internal (${identity.buildId})`;
  }
  return `PuppyOne ${identity.version}`;
}

export function createDesktopBuildR2Prefix(buildInfo, platform = "mac") {
  const identity = assertDesktopBuildInfo(buildInfo);
  if (!isDesktopPublishedChannel(identity.channel)) {
    throw new Error("Development builds do not have release distribution coordinates.");
  }
  return `desktop/${identity.channel}/${platform}/${createDesktopBuildTag(identity)}`;
}

export function inspectDesktopBuildInfo(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["build info must be an object"];
  }

  const unknownKeys = Object.keys(value).filter((key) => !BUILD_INFO_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    errors.push(`build info contains unsupported fields: ${unknownKeys.sort().join(", ")}`);
  }
  if (value.schemaVersion !== DESKTOP_BUILD_INFO_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DESKTOP_BUILD_INFO_SCHEMA_VERSION}`);
  }
  if (value.product !== DESKTOP_BUILD_PRODUCT) {
    errors.push(`product must be ${DESKTOP_BUILD_PRODUCT}`);
  }
  if (!isDesktopBuildChannel(value.channel)) {
    errors.push("channel must be dev, internal, or stable");
  }
  if (!BASE_VERSION_PATTERN.test(String(value.baseVersion ?? ""))) {
    errors.push("baseVersion must be a stable semantic version");
  }
  if (!FULL_COMMIT_PATTERN.test(String(value.commitSha ?? ""))) {
    errors.push("commitSha must be a full lowercase Git commit SHA");
  }
  if (!isCanonicalTimestamp(value.builtAt)) {
    errors.push("builtAt must be a canonical UTC ISO timestamp");
  }
  if (typeof value.sourceDirty !== "boolean") {
    errors.push("sourceDirty must be boolean");
  }

  if (isDesktopBuildChannel(value.channel)
    && BASE_VERSION_PATTERN.test(String(value.baseVersion ?? ""))
    && FULL_COMMIT_PATTERN.test(String(value.commitSha ?? ""))
    && isCanonicalTimestamp(value.builtAt)
    && typeof value.sourceDirty === "boolean") {
    try {
      const expected = resolveDesktopBuildIdentity({
        baseVersion: value.baseVersion,
        channel: value.channel,
        commitSha: value.commitSha,
        buildNumber: value.channel === "dev" ? null : value.buildId,
        builtAt: value.builtAt,
        sourceDirty: value.sourceDirty,
      });
      for (const key of ["version", "buildId", "platformBuildNumber"]) {
        if (value[key] !== expected[key]) {
          errors.push(`${key} does not match the canonical ${value.channel} build identity`);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return [...new Set(errors)];
}

export function assertDesktopBuildInfo(value) {
  const errors = inspectDesktopBuildInfo(value);
  if (errors.length > 0) {
    throw new Error(`Invalid PuppyOne Desktop build identity:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  return deepFreeze(structuredClone(value));
}

function normalizeBaseVersion(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!BASE_VERSION_PATTERN.test(normalized)) {
    throw new Error(`Desktop base version must be stable SemVer; received ${String(value)}`);
  }
  return normalized;
}

function normalizeChannel(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!isDesktopBuildChannel(normalized)) {
    throw new Error(`Desktop build channel must be dev, internal, or stable; received ${String(value)}`);
  }
  return normalized;
}

function normalizeCommitSha(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!FULL_COMMIT_PATTERN.test(normalized)) {
    throw new Error("Desktop builds require a full lowercase Git commit SHA.");
  }
  return normalized;
}

function normalizeBuildNumber(value) {
  const normalized = String(value ?? "").trim();
  if (!BUILD_NUMBER_PATTERN.test(normalized)) {
    throw new Error("Published Desktop builds require a positive numeric CI build number.");
  }
  return normalized;
}

function normalizeTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid Desktop build timestamp: ${String(value)}`);
  }
  return date.toISOString();
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
