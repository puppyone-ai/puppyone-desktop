import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  checkViewerPackEngineCompatibility,
  isValidViewerPackId,
  isValidViewerPackVersion,
  normalizePackRelativePath,
  validateViewerPackManifest,
} from "./manifest-schema.mjs";

/** Main-process registry and verified asset resolver for installed Viewer Packs. */

const SHA256_RE = /^[a-f0-9]{64}$/;

export function createViewerPackRegistryService({
  store,
  hostVersion,
  getTrustedSigners,
  now = () => new Date().toISOString(),
}) {
  if (!store) throw new TypeError("store is required");
  if (typeof hostVersion !== "string" || !hostVersion) throw new TypeError("hostVersion is required");
  if (typeof getTrustedSigners !== "function") throw new TypeError("getTrustedSigners is required");

  let cachedSnapshot = null;
  let cachedSequence = -1;

  async function buildContributionSnapshot() {
    await store.ensureLayout();
    const state = await store.readRegistryState();
    const contributions = [];
    const trustedSigners = new Map(
      getTrustedSigners().map((signer) => [signer.keyId, signer]),
    );

    for (const [pluginId, enabled] of Object.entries(state.enabled ?? {})) {
      try {
        const normalized = normalizeEnabledRecord({ pluginId, enabled, trustedSigners });
        const { bytes: manifestBytes } = await readPackageFile({
          pluginId,
          contentHash: normalized.contentHash,
          relativePath: "manifest.json",
        });
        const raw = JSON.parse(manifestBytes.toString("utf8"));
        const validated = validateViewerPackManifest(raw);
        if (!validated.ok) continue;
        const manifest = validated.value;
        const compatibility = checkViewerPackEngineCompatibility(manifest, { hostVersion });
        if (!compatibility.ok) continue;
        if (
          manifest.id !== pluginId ||
          manifest.version !== normalized.version ||
          manifest.publisher !== normalized.publisher ||
          !normalized.inventoryByPath.has(manifest.viewer.entry)
        ) {
          continue;
        }

        contributions.push({
          pluginId,
          publisher: manifest.publisher,
          version: normalized.version,
          label: deriveContributionLabel(manifest),
          enabled: true,
          contentHash: normalized.contentHash,
          viewer: manifest.viewer,
          formats: manifest.formats,
          permissions: manifest.permissions,
          installedAt: normalized.installedAt ?? now(),
        });
      } catch {
        // A corrupt, incompatible, revoked or partially-installed record is not
        // published to renderers and therefore cannot activate.
      }
    }

    contributions.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
    return {
      sequence: Number(state.sequence || 0),
      generatedAt: now(),
      contributions,
    };
  }

  async function getContributionSnapshot({ force = false } = {}) {
    const state = await store.readRegistryState();
    const sequence = Number(state.sequence || 0);
    if (!force && cachedSnapshot && cachedSequence === sequence) return cachedSnapshot;
    const snapshot = await buildContributionSnapshot();
    cachedSnapshot = deepFreeze(snapshot);
    cachedSequence = sequence;
    return cachedSnapshot;
  }

  function invalidate() {
    cachedSnapshot = null;
    cachedSequence = -1;
  }

  async function resolvePackageFile({ pluginId, contentHash, relativePath }) {
    if (!isValidViewerPackId(pluginId)) throw new Error("Viewer Pack id is invalid.");
    const state = await store.readRegistryState();
    const enabled = state.enabled?.[pluginId];
    const trustedSigners = new Map(getTrustedSigners().map((signer) => [signer.keyId, signer]));
    const normalized = normalizeEnabledRecord({ pluginId, enabled, trustedSigners });
    if (normalized.contentHash !== contentHash) throw new Error("Viewer Pack content hash mismatch.");

    const normalizedPath = normalizePackRelativePath(relativePath);
    if (!normalizedPath.ok) throw new Error(`Rejected package path (${normalizedPath.reason}).`);
    const inventoryItem = normalized.inventoryByPath.get(normalizedPath.path);
    if (!inventoryItem) throw new Error("Package asset is not in the signed install inventory.");

    const versionDir = store.packageContentDir(pluginId, normalized.version, normalized.contentHash);
    const absolutePath = path.resolve(versionDir, ...normalizedPath.path.split("/"));
    assertInside(versionDir, absolutePath);
    const metadata = await fsp.lstat(absolutePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("Package asset is not a regular file.");
    }
    const realPath = await fsp.realpath(absolutePath);
    assertInside(await fsp.realpath(versionDir), realPath);
    if (metadata.size !== inventoryItem.sizeBytes) {
      throw new Error("Package asset size does not match install inventory.");
    }
    return {
      absolutePath: realPath,
      versionDir,
      pluginId,
      version: normalized.version,
      contentHash: normalized.contentHash,
      relativePath: normalizedPath.path,
      expectedSha256: inventoryItem.sha256,
      sizeBytes: inventoryItem.sizeBytes,
    };
  }

  async function readPackageFile(request) {
    const resolved = await resolvePackageFile(request);
    const bytes = await readRegularFileNoFollow(resolved.absolutePath, resolved.sizeBytes);
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (actualSha !== resolved.expectedSha256) {
      throw new Error("Package asset hash does not match install inventory.");
    }
    return { ...resolved, bytes };
  }

  return {
    getContributionSnapshot,
    invalidate,
    resolvePackageFile,
    readPackageFile,
  };
}

function normalizeEnabledRecord({ pluginId, enabled, trustedSigners }) {
  if (!isValidViewerPackId(pluginId) || !enabled || typeof enabled !== "object") {
    throw new Error("Viewer Pack registry entry is invalid.");
  }
  if (!isValidViewerPackVersion(enabled.version)) throw new Error("Viewer Pack version is invalid.");
  if (typeof enabled.contentHash !== "string" || !SHA256_RE.test(enabled.contentHash)) {
    throw new Error("Viewer Pack content hash is invalid.");
  }
  if (typeof enabled.packageSha256 !== "string" || !SHA256_RE.test(enabled.packageSha256)) {
    throw new Error("Viewer Pack package hash is invalid.");
  }
  const signer = trustedSigners.get(enabled.signerKeyId);
  if (!signer || signer.publisher !== enabled.publisher) {
    throw new Error("Viewer Pack signer is no longer trusted.");
  }
  const inventory = normalizeInventory(enabled.inventory);
  const computedContentHash = createHash("sha256")
    .update(inventory.map((item) => `${item.path}:${item.sizeBytes}:${item.sha256}`).join("\n"))
    .digest("hex");
  if (computedContentHash !== enabled.contentHash) {
    throw new Error("Viewer Pack inventory content hash is invalid.");
  }
  return {
    pluginId,
    version: enabled.version,
    contentHash: enabled.contentHash,
    publisher: enabled.publisher,
    signerKeyId: enabled.signerKeyId,
    installedAt: enabled.installedAt ?? null,
    inventory,
    inventoryByPath: new Map(inventory.map((item) => [item.path, item])),
  };
}

function normalizeInventory(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 2_000) {
    throw new Error("Viewer Pack inventory is invalid.");
  }
  const seen = new Set();
  const inventory = raw.map((item) => {
    const normalizedPath = normalizePackRelativePath(item?.path);
    if (!normalizedPath.ok || seen.has(normalizedPath.path)) {
      throw new Error("Viewer Pack inventory path is invalid.");
    }
    if (typeof item.sha256 !== "string" || !SHA256_RE.test(item.sha256)) {
      throw new Error("Viewer Pack inventory hash is invalid.");
    }
    if (!Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 0) {
      throw new Error("Viewer Pack inventory size is invalid.");
    }
    seen.add(normalizedPath.path);
    return { path: normalizedPath.path, sha256: item.sha256, sizeBytes: item.sizeBytes };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (!seen.has("manifest.json")) throw new Error("Viewer Pack manifest inventory entry is missing.");
  return inventory;
}

async function readRegularFileNoFollow(filePath, expectedSize) {
  const noFollow = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
  const handle = await fsp.open(filePath, fs.constants.O_RDONLY | noFollow);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size !== expectedSize) {
      throw new Error("Package asset changed while opening.");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function assertInside(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Package path escapes its immutable content directory.");
  }
}

function deriveContributionLabel(manifest) {
  return manifest.formats[0]?.label?.trim() || manifest.id;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
