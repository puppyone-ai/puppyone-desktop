import {
  compareCanonicalDesktopVersions,
  parseCanonicalDesktopVersion,
} from "../../shared/desktop/update-policy.mjs";

const RELEASE_CHANNELS = new Set(["internal", "stable"]);
const DESKTOP_RELEASE_PRODUCT = "puppyone-desktop";

export function inspectDesktopReleaseHistory({ channel, latestPointer, catalog }) {
  assertReleaseChannel(channel);
  if (!latestPointer || typeof latestPointer !== "object" || Array.isArray(latestPointer)) {
    throw new Error(`${channel} latest.json must be an object.`);
  }
  if (latestPointer.channel !== channel) {
    throw new Error(`${channel} latest.json declares channel ${String(latestPointer.channel)}.`);
  }
  if (latestPointer.schemaVersion !== 2 || latestPointer.product !== DESKTOP_RELEASE_PRODUCT) {
    throw new Error(`${channel} latest.json must use the canonical Desktop release schema and product.`);
  }
  const latestVersion = assertCanonicalChannelVersion(latestPointer.version, channel, "latest.json version");
  if (latestPointer.tag !== `v${latestVersion}`) {
    throw new Error(`${channel} latest.json tag must exactly match v${latestVersion}.`);
  }
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog) || !Array.isArray(catalog.releases)) {
    throw new Error(`${channel} release catalog must contain a releases array.`);
  }
  if (catalog.schemaVersion !== 1 || catalog.product !== DESKTOP_RELEASE_PRODUCT) {
    throw new Error(`${channel} release catalog must use the canonical Desktop catalog schema and product.`);
  }

  const releases = catalog.releases.filter((release) => release?.channel === channel);
  if (releases.length === 0) {
    throw new Error(`${channel} release catalog contains no ${channel} releases.`);
  }
  const historicalVersions = releases.map((release) => {
    if (release.schemaVersion !== 2 || release.product !== DESKTOP_RELEASE_PRODUCT) {
      throw new Error(`${String(release.tag)} must use the canonical Desktop release schema and product.`);
    }
    const version = assertCanonicalChannelVersion(
      release.version,
      channel,
      `${String(release.tag ?? "untagged release")} version`,
    );
    if (release.tag !== `v${version}`) {
      throw new Error(`${String(release.tag)} must exactly match v${version}.`);
    }
    return version;
  });
  if (!historicalVersions.includes(latestVersion)) {
    throw new Error(`${channel} latest version ${latestVersion} is absent from its release catalog.`);
  }
  const highestPublishedVersion = [...historicalVersions]
    .sort((left, right) => compareCanonicalDesktopVersions(right, left))[0];

  return Object.freeze({
    channel,
    highestPublishedVersion,
    historicalVersions: Object.freeze([...historicalVersions]),
    latestVersion,
  });
}

export function assertDesktopReleaseVersionAdvances({
  channel,
  candidateVersion,
  latestPointer,
  catalog,
}) {
  const history = inspectDesktopReleaseHistory({ channel, latestPointer, catalog });
  const candidate = assertCanonicalChannelVersion(candidateVersion, channel, "candidate version");
  if (compareCanonicalDesktopVersions(candidate, history.highestPublishedVersion) <= 0) {
    throw new Error(
      `${channel} candidate ${candidate} must be newer than every previously published `
      + `${channel} version; highest published version is ${history.highestPublishedVersion}.`,
    );
  }
  return Object.freeze({
    ...history,
    candidateVersion: candidate,
  });
}

export function assertDesktopLatestVersionIsHistoryHead({
  channel,
  latestPointer,
  catalog,
}) {
  const history = inspectDesktopReleaseHistory({ channel, latestPointer, catalog });
  if (history.latestVersion !== history.highestPublishedVersion) {
    throw new Error(
      `${channel} latest version ${history.latestVersion} is behind published history head `
      + `${history.highestPublishedVersion}.`,
    );
  }
  return history;
}

function assertReleaseChannel(channel) {
  if (!RELEASE_CHANNELS.has(channel)) {
    throw new Error(`Desktop release version policy requires internal or stable channel; received ${String(channel)}.`);
  }
}

function assertCanonicalChannelVersion(value, channel, label) {
  if (typeof value !== "string" || value.trim() !== value || !value) {
    throw new Error(`${label} must be a canonical semantic version.`);
  }
  const parsed = parseCanonicalDesktopVersion(value);
  if (!parsed) {
    throw new Error(`${label} must be a canonical semantic version.`);
  }
  if (channel === "stable" && parsed.prerelease.length !== 0) {
    throw new Error(`${label} must be a Stable version without prerelease components.`);
  }
  if (channel === "stable" && value.includes("+")) {
    throw new Error(`${label} must be a Stable version without build metadata.`);
  }
  if (
    channel === "internal"
    && (
      parsed.prerelease.length !== 2
      || parsed.prerelease[0] !== "internal"
      || !Number.isSafeInteger(parsed.prerelease[1])
      || parsed.prerelease[1] <= 0
      || value.includes("+")
    )
  ) {
    throw new Error(`${label} must use the canonical -internal.<build> form.`);
  }
  return parsed.version;
}
