export const DESKTOP_UPDATE_VERSION_RELATIONS = Object.freeze([
  "newer",
  "same",
  "older",
  "invalid",
]);

/**
 * Compare an updater candidate with the version that is already running.
 * Invalid or non-canonical versions fail closed and can never be actionable.
 */
export function evaluateDesktopUpdateCandidate({
  channel,
  currentVersion,
  candidateVersion,
}) {
  const normalizedChannel = normalizeChannel(channel);
  const current = parseCanonicalVersion(currentVersion);
  const candidate = parseCanonicalVersion(candidateVersion);

  if (!normalizedChannel || !current || !candidate) {
    const invalid = [];
    if (!normalizedChannel) invalid.push("channel");
    if (!current) invalid.push("currentVersion");
    if (!candidate) invalid.push("candidateVersion");
    return Object.freeze({
      allowed: false,
      candidateVersion: candidate?.version ?? null,
      channel: normalizedChannel,
      channelCompatible: false,
      currentVersion: current?.version ?? null,
      invalid: Object.freeze(invalid),
      relation: "invalid",
    });
  }

  const comparison = compareParsedVersions(candidate, current);
  const channelCompatible = isVersionCompatibleWithChannel(current, normalizedChannel)
    && isVersionCompatibleWithChannel(candidate, normalizedChannel);
  return Object.freeze({
    allowed: comparison > 0 && channelCompatible,
    candidateVersion: candidate.version,
    channel: normalizedChannel,
    channelCompatible,
    currentVersion: current.version,
    invalid: Object.freeze([]),
    relation: comparison > 0 ? "newer" : comparison < 0 ? "older" : "same",
  });
}

export function isDesktopUpdateCandidateNewer(options) {
  return evaluateDesktopUpdateCandidate(options).allowed;
}

function normalizeChannel(value) {
  return value === "dev" || value === "internal" || value === "stable" ? value : null;
}

function isVersionCompatibleWithChannel(version, channel) {
  if (channel === "stable") return version.prerelease.length === 0 && !version.version.includes("+");
  if (channel === "dev") return version.prerelease.length > 0;
  if (version.version.includes("+")) return false;
  if (version.prerelease[0] !== channel || version.prerelease.length !== 2) return false;
  const buildNumber = version.prerelease[1];
  return Number.isSafeInteger(buildNumber) && buildNumber > 0;
}

function parseCanonicalVersion(value) {
  if (typeof value !== "string" || value.trim() !== value || !value) return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match) return null;
  const core = match.slice(1, 4).map((part) => Number.parseInt(part, 10));
  if (core.some((part) => !Number.isSafeInteger(part))) return null;
  const prerelease = match[4]
    ? match[4].split(".").map((identifier) => {
        if (!/^\d+$/.test(identifier)) return identifier;
        if (identifier.length > 1 && identifier.startsWith("0")) return null;
        const numeric = Number.parseInt(identifier, 10);
        return Number.isSafeInteger(numeric) ? numeric : null;
      })
    : [];
  if (prerelease.some((identifier) => identifier == null)) return null;
  return Object.freeze({
    version: value,
    major: core[0],
    minor: core[1],
    patch: core[2],
    prerelease: Object.freeze(prerelease),
  });
}

export function parseCanonicalDesktopVersion(value) {
  return parseCanonicalVersion(value);
}

export function compareCanonicalDesktopVersions(left, right) {
  const parsedLeft = parseCanonicalVersion(left);
  const parsedRight = parseCanonicalVersion(right);
  if (!parsedLeft || !parsedRight) {
    throw new Error("Desktop version comparison requires canonical semantic versions.");
  }
  return compareParsedVersions(parsedLeft, parsedRight);
}

function compareParsedVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = typeof leftIdentifier === "number";
    const rightNumeric = typeof rightIdentifier === "number";
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}
