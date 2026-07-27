import {
  assertDesktopReleaseCatalog,
  assertDesktopReleaseManifest,
} from "./desktop-release-metadata.mjs";

export function selectStablePromotionSource({
  catalog,
  baseVersion,
  commitSha,
}) {
  assertDesktopReleaseCatalog(catalog);
  if (!/^\d+\.\d+\.\d+$/.test(String(baseVersion ?? ""))) {
    throw new Error("Stable promotion requires a stable semantic base version.");
  }
  if (!/^[a-f0-9]{40}$/.test(String(commitSha ?? ""))) {
    throw new Error("Stable promotion requires a full lowercase Git commit SHA.");
  }

  const candidates = catalog.releases
    .filter((release) => (
      release.schemaVersion === 2
      && release.channel === "internal"
      && release.provenance === "pipeline"
      && release.baseVersion === baseVersion
      && release.commitSha === commitSha
      && release.prerelease === true
      && release.build?.sourceDirty === false
      && release.status !== "withdrawn"
      && release.withdrawn !== true
      && release.withdrawnAt == null
    ))
    .sort((left, right) => (
      Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
      || Number(right.build.id) - Number(left.build.id)
    ));

  const source = candidates[0];
  if (!source) {
    throw new Error(
      `No verified Internal ${baseVersion} release exists for commit ${commitSha}.`,
    );
  }
  assertDesktopReleaseManifest(source);
  return source;
}

export function assertStablePromotionCoordinates({ source, catalogUrl }) {
  const manifest = assertDesktopReleaseManifest(source);
  const catalog = parseCredentialFreeHttpsUrl(catalogUrl, "Internal catalog URL");
  if (!catalog.pathname.startsWith("/desktop/internal/")) {
    throw new Error("Stable promotion requires the catalog under /desktop/internal/.");
  }
  if (!manifest.r2.prefix.startsWith("desktop/internal/")) {
    throw new Error("Stable promotion requires an Internal R2 prefix.");
  }

  const coordinates = [
    ["manifest", manifest.r2.manifestUrl],
    ["checksums", manifest.r2.checksumsUrl],
    ["Build Info", manifest.r2.buildInfoUrl],
    ...manifest.assets.map((asset) => [asset.name, asset.r2.url]),
  ];
  for (const [label, value] of coordinates) {
    const url = parseCredentialFreeHttpsUrl(value, `${label} URL`);
    if (url.origin !== catalog.origin || !url.pathname.startsWith("/desktop/internal/")) {
      throw new Error(
        `${label} URL must stay on ${catalog.origin} under /desktop/internal/.`,
      );
    }
  }
  return manifest;
}

function parseCredentialFreeHttpsUrl(value, label) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${label} must be a credential-free HTTPS URL without a fragment.`);
  }
  return url;
}
