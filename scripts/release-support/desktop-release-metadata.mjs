import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const DESKTOP_RELEASE_SCHEMA_VERSION = 1;
export const DESKTOP_CATALOG_SCHEMA_VERSION = 1;
export const DESKTOP_RELEASE_PRODUCT = "puppyone-desktop";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const TAG_PATTERN = /^v[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PREFIX_PATTERN = /^[a-z0-9][a-z0-9._/-]*$/;
const ASSET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function createDesktopReleaseManifest({
  arch,
  assetPaths,
  channel,
  commitSha,
  developerIdSigned,
  githubReleaseAvailable = channel !== "archive",
  notarized,
  prerelease,
  provenance = channel === "archive" ? "archive" : "pipeline",
  publicOrigin,
  publishedAt,
  repository,
  r2Prefix,
  tag,
  version,
  workflowRunUrl,
}) {
  assertNonEmptyArray(assetPaths, "assetPaths");
  const normalizedOrigin = normalizeOrigin(publicOrigin);
  const normalizedPrefix = normalizePrefix(r2Prefix);
  const names = new Set();
  const assets = [];

  for (const assetPath of assetPaths) {
    const name = path.basename(assetPath);
    if (names.has(name)) throw new Error(`Duplicate release asset name: ${name}`);
    names.add(name);
    const stats = await fs.stat(assetPath);
    if (!stats.isFile()) throw new Error(`Release asset is not a file: ${assetPath}`);
    const assetArch = inferArchitecture(name, arch);
    const kind = inferAssetKind(name);
    const sha256 = await sha256File(assetPath);
    const key = `${normalizedPrefix}/${name}`;
    assets.push({
      name,
      kind,
      platform: "macos",
      arch: assetArch,
      bytes: stats.size,
      sha256,
      r2: {
        key,
        url: joinPublicUrl(normalizedOrigin, key),
      },
      github: {
        url: githubReleaseAvailable ? githubAssetUrl(repository, tag, name) : null,
      },
      latestAlias: inferLatestAlias({ arch: assetArch, kind, name }),
    });
  }

  assets.sort((left, right) => left.name.localeCompare(right.name));
  const manifest = {
    schemaVersion: DESKTOP_RELEASE_SCHEMA_VERSION,
    product: DESKTOP_RELEASE_PRODUCT,
    tag,
    version,
    channel,
    provenance,
    prerelease: prerelease === true,
    publishedAt: normalizeTimestamp(publishedAt),
    commitSha: commitSha || null,
    source: {
      repository,
      workflowRunUrl: workflowRunUrl || null,
    },
    github: {
      releaseUrl: githubReleaseAvailable ? githubReleaseUrl(repository, tag) : null,
    },
    r2: {
      prefix: normalizedPrefix,
      manifestUrl: joinPublicUrl(normalizedOrigin, `${normalizedPrefix}/release.json`),
      checksumsUrl: joinPublicUrl(normalizedOrigin, `${normalizedPrefix}/SHA256SUMS`),
    },
    security: {
      developerIdSigned: developerIdSigned === true,
      notarized: notarized === true,
    },
    assets,
  };
  assertDesktopReleaseManifest(manifest);
  return manifest;
}

export function assertDesktopReleaseManifest(manifest) {
  const errors = inspectDesktopReleaseManifest(manifest);
  if (errors.length === 0) return manifest;
  throw new Error(`Invalid desktop release manifest:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

export function inspectDesktopReleaseManifest(manifest) {
  const errors = [];
  if (manifest?.schemaVersion !== DESKTOP_RELEASE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DESKTOP_RELEASE_SCHEMA_VERSION}`);
  }
  if (manifest?.product !== DESKTOP_RELEASE_PRODUCT) {
    errors.push(`product must be ${DESKTOP_RELEASE_PRODUCT}`);
  }
  if (!TAG_PATTERN.test(String(manifest?.tag ?? ""))) {
    errors.push("tag must be a safe v-prefixed release tag");
  }
  if (!VERSION_PATTERN.test(String(manifest?.version ?? ""))) {
    errors.push("version must be semantic");
  }
  if (!["internal", "stable", "archive"].includes(manifest?.channel)) {
    errors.push("channel must be internal, stable, or archive");
  }
  if (!["pipeline", "backfill", "archive"].includes(manifest?.provenance)) {
    errors.push("provenance must be pipeline, backfill, or archive");
  }
  if (manifest?.channel === "archive" && manifest?.provenance !== "archive") {
    errors.push("archive channel releases must use archive provenance");
  }
  if (manifest?.channel !== "archive" && manifest?.provenance === "archive") {
    errors.push("archive provenance is reserved for the archive channel");
  }
  if (
    !COMMIT_PATTERN.test(String(manifest?.commitSha ?? ""))
    && !(manifest?.channel === "archive" && manifest?.commitSha == null)
  ) {
    errors.push("commitSha must be a full lowercase Git commit SHA, or null for an archive release");
  }
  if (!Number.isFinite(Date.parse(manifest?.publishedAt))) {
    errors.push("publishedAt must be an ISO timestamp");
  }
  if (!REPOSITORY_PATTERN.test(String(manifest?.source?.repository ?? ""))) {
    errors.push("source.repository must use owner/repository syntax");
  }
  if (manifest?.source?.workflowRunUrl != null && !isHttpsUrl(manifest.source.workflowRunUrl)) {
    errors.push("source.workflowRunUrl must be an HTTPS URL or null");
  }
  if (!isHttpsUrl(manifest?.github?.releaseUrl) && !(manifest?.channel === "archive" && manifest?.github?.releaseUrl == null)) {
    errors.push("github.releaseUrl must be an HTTPS URL, or null for an archive release");
  }
  if (!validPrefix(manifest?.r2?.prefix) || !String(manifest?.r2?.prefix).endsWith(`/${manifest?.tag}`)) {
    errors.push("r2.prefix must be a safe immutable prefix ending in the release tag");
  }
  if (!isHttpsUrl(manifest?.r2?.manifestUrl) || !isHttpsUrl(manifest?.r2?.checksumsUrl)) {
    errors.push("R2 manifest and checksum URLs must use HTTPS");
  }
  if (typeof manifest?.security?.developerIdSigned !== "boolean" || typeof manifest?.security?.notarized !== "boolean") {
    errors.push("security signing and notarization values must be boolean");
  }
  if (manifest?.channel === "stable") {
    if (manifest.prerelease !== false) errors.push("stable releases cannot be prereleases");
    if (manifest?.security?.developerIdSigned !== true) errors.push("stable releases must be Developer ID signed");
    if (manifest?.security?.notarized !== true) errors.push("stable releases must be notarized");
  }
  if (manifest?.channel === "internal" && manifest?.prerelease !== true) {
    errors.push("internal releases must be marked as prereleases");
  }

  if (!Array.isArray(manifest?.assets) || manifest.assets.length === 0) {
    errors.push("assets must contain at least one release file");
    return errors;
  }

  const names = new Set();
  const aliases = new Set();
  for (const asset of manifest.assets) {
    if (
      typeof asset?.name !== "string"
      || asset.name !== path.basename(asset.name)
      || !ASSET_NAME_PATTERN.test(asset.name)
    ) {
      errors.push("every asset name must be a safe non-empty basename");
      continue;
    }
    if (names.has(asset.name)) errors.push(`duplicate asset name: ${asset.name}`);
    names.add(asset.name);
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) {
      errors.push(`${asset.name} has an invalid byte length`);
    }
    if (!SHA256_PATTERN.test(String(asset.sha256 ?? ""))) {
      errors.push(`${asset.name} has an invalid SHA-256 digest`);
    }
    if (asset.platform !== "macos") errors.push(`${asset.name} must target macos`);
    if (!["arm64", "x64", "universal"].includes(asset.arch)) {
      errors.push(`${asset.name} has an unsupported architecture`);
    }
    if (asset?.r2?.key !== `${manifest.r2.prefix}/${asset.name}` || !isHttpsUrl(asset?.r2?.url)) {
      errors.push(`${asset.name} has invalid R2 coordinates`);
    }
    if (!isHttpsUrl(asset?.github?.url) && !(manifest?.channel === "archive" && asset?.github?.url == null)) {
      errors.push(`${asset.name} has an invalid GitHub URL`);
    }
    if (asset.latestAlias != null) {
      if (asset.latestAlias !== path.basename(asset.latestAlias) || !ASSET_NAME_PATTERN.test(asset.latestAlias)) {
        errors.push(`${asset.name} has an invalid latest alias`);
      }
      if (aliases.has(asset.latestAlias)) errors.push(`duplicate latest alias: ${asset.latestAlias}`);
      aliases.add(asset.latestAlias);
    }
  }

  if (manifest?.channel !== "archive") {
    for (const requiredKind of ["dmg", "zip"]) {
      if (!manifest.assets.some((asset) => asset.kind === requiredKind)) {
        errors.push(`release assets must include a ${requiredKind}`);
      }
    }
  }
  if (manifest?.channel === "stable" && !manifest.assets.some((asset) => asset.kind === "updater-metadata")) {
    errors.push("stable release assets must include latest-mac.yml");
  }
  if (
    manifest?.channel === "internal"
    && manifest?.provenance === "pipeline"
    && !manifest.assets.some((asset) => asset.kind === "terminal-preview")
  ) {
    errors.push("internal release assets must include the Terminal preview package");
  }
  return errors;
}

export function createChecksumsFile(manifest) {
  assertDesktopReleaseManifest(manifest);
  return `${manifest.assets.map((asset) => `${asset.sha256}  ${asset.name}`).join("\n")}\n`;
}

export function createLatestPointer(manifest) {
  assertDesktopReleaseManifest(manifest);
  if (manifest.channel === "archive") throw new Error("Archive releases do not have mutable latest pointers");
  const latestPrefix = `${manifest.r2.prefix.slice(0, -(manifest.tag.length))}latest`;
  return {
    schemaVersion: DESKTOP_RELEASE_SCHEMA_VERSION,
    product: manifest.product,
    channel: manifest.channel,
    provenance: manifest.provenance,
    tag: manifest.tag,
    version: manifest.version,
    publishedAt: manifest.publishedAt,
    commitSha: manifest.commitSha,
    manifestUrl: manifest.r2.manifestUrl,
    githubReleaseUrl: manifest.github.releaseUrl,
    assets: manifest.assets.map((asset) => ({
      name: asset.name,
      kind: asset.kind,
      platform: asset.platform,
      arch: asset.arch,
      bytes: asset.bytes,
      sha256: asset.sha256,
      versionedUrl: asset.r2.url,
      latestUrl: joinPublicUrl(originOf(asset.r2.url), `${latestPrefix}/${asset.latestAlias ?? asset.name}`),
    })),
  };
}

export function mergeReleaseCatalog(existingCatalog, manifest, generatedAt = new Date().toISOString()) {
  assertDesktopReleaseManifest(manifest);
  const catalog = existingCatalog == null
    ? {
        schemaVersion: DESKTOP_CATALOG_SCHEMA_VERSION,
        product: DESKTOP_RELEASE_PRODUCT,
        generatedAt: normalizeTimestamp(generatedAt),
        releases: [],
      }
    : structuredClone(existingCatalog);
  assertDesktopReleaseCatalog(catalog);

  const existingIndex = catalog.releases.findIndex((release) => release.tag === manifest.tag);
  if (existingIndex >= 0) {
    if (canonicalJson(catalog.releases[existingIndex]) !== canonicalJson(manifest)) {
      throw new Error(`Release catalog already contains a different immutable release for ${manifest.tag}`);
    }
  } else {
    catalog.releases.push(structuredClone(manifest));
  }
  catalog.generatedAt = normalizeTimestamp(generatedAt);
  catalog.releases.sort((left, right) => (
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
    || right.tag.localeCompare(left.tag)
  ));
  assertDesktopReleaseCatalog(catalog);
  return catalog;
}

export function assertDesktopReleaseCatalog(catalog) {
  const errors = [];
  if (catalog?.schemaVersion !== DESKTOP_CATALOG_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DESKTOP_CATALOG_SCHEMA_VERSION}`);
  }
  if (catalog?.product !== DESKTOP_RELEASE_PRODUCT) errors.push(`product must be ${DESKTOP_RELEASE_PRODUCT}`);
  if (!Number.isFinite(Date.parse(catalog?.generatedAt))) errors.push("generatedAt must be an ISO timestamp");
  if (!Array.isArray(catalog?.releases)) {
    errors.push("releases must be an array");
  } else {
    const tags = new Set();
    for (const release of catalog.releases) {
      errors.push(...inspectDesktopReleaseManifest(release).map((error) => `${release?.tag ?? "unknown"}: ${error}`));
      if (tags.has(release?.tag)) errors.push(`duplicate release tag: ${release.tag}`);
      tags.add(release?.tag);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Invalid desktop release catalog:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  return catalog;
}

export async function verifyDesktopReleaseBundle(bundleDirectory, expected = {}) {
  const manifestPath = path.join(bundleDirectory, "release.json");
  const checksumsPath = path.join(bundleDirectory, "SHA256SUMS");
  const latestPath = path.join(bundleDirectory, "latest.json");
  const notesPath = path.join(bundleDirectory, "release-notes.md");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assertDesktopReleaseManifest(manifest);
  for (const [key, value] of Object.entries(expected)) {
    if (value != null && manifest[key] !== value) {
      throw new Error(`Release bundle ${key} mismatch: expected ${value}, received ${manifest[key]}`);
    }
  }

  const expectedChecksums = createChecksumsFile(manifest);
  const actualChecksums = await fs.readFile(checksumsPath, "utf8");
  if (actualChecksums !== expectedChecksums) throw new Error("SHA256SUMS does not match release.json");
  if (manifest.channel !== "archive") {
    const latest = JSON.parse(await fs.readFile(latestPath, "utf8"));
    if (latest.tag !== manifest.tag || latest.commitSha !== manifest.commitSha) {
      throw new Error("latest.json does not point at the bundled release");
    }
  }
  const notes = await fs.readFile(notesPath, "utf8");
  if (notes.trim().length === 0) throw new Error("release-notes.md must not be empty");

  for (const asset of manifest.assets) {
    const assetPath = path.join(bundleDirectory, "assets", asset.name);
    const stats = await fs.stat(assetPath);
    if (!stats.isFile() || stats.size !== asset.bytes) {
      throw new Error(`${asset.name} does not match its declared byte length`);
    }
    const digest = await sha256File(assetPath);
    if (digest !== asset.sha256) throw new Error(`${asset.name} does not match its declared SHA-256 digest`);
  }
  return { manifest, manifestPath, checksumsPath, latestPath, notesPath };
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close().catch(() => {});
  }
  return hash.digest("hex");
}

export function jsonFile(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function inferAssetKind(name) {
  if (name === "latest-mac.yml") return "updater-metadata";
  if (name.endsWith(".dmg")) return "dmg";
  if (name.endsWith(".zip")) return "zip";
  if (name.endsWith(".blockmap")) return "blockmap";
  if (name.endsWith(".tgz") && name.includes("terminal-preview")) return "terminal-preview";
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "updater-metadata";
  return "artifact";
}

function inferArchitecture(name, fallback) {
  const match = name.match(/(?:^|[-_.])(arm64|x64|universal)(?:[-_.]|$)/);
  const value = match?.[1] ?? fallback;
  if (!["arm64", "x64", "universal"].includes(value)) {
    throw new Error(`Unable to determine a supported architecture for ${name}`);
  }
  return value;
}

function inferLatestAlias({ arch, kind }) {
  if (kind === "dmg") return `puppyone-latest-${arch}.dmg`;
  if (kind === "zip") return `puppyone-latest-${arch}.zip`;
  if (kind === "terminal-preview") return `puppyone-terminal-preview-latest-${arch}.tgz`;
  return null;
}

function githubReleaseUrl(repository, tag) {
  if (!REPOSITORY_PATTERN.test(String(repository ?? ""))) throw new Error("repository must use owner/repository syntax");
  return `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`;
}

function githubAssetUrl(repository, tag, name) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}

function joinPublicUrl(origin, key) {
  return `${normalizeOrigin(origin)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function originOf(url) {
  return new URL(url).origin;
}

function normalizeOrigin(origin) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("publicOrigin must be a clean HTTPS origin");
  }
  return url.origin;
}

function normalizePrefix(prefix) {
  if (!validPrefix(prefix)) throw new Error(`Invalid R2 prefix: ${prefix}`);
  return prefix;
}

function validPrefix(prefix) {
  return (
    typeof prefix === "string"
    && PREFIX_PATTERN.test(prefix)
    && !prefix.endsWith("/")
    && !prefix.includes("//")
    && !prefix.includes("..")
  );
}

function normalizeTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid release timestamp: ${value}`);
  return date.toISOString();
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function assertNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
