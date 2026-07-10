import fsp from "node:fs/promises";
import path from "node:path";
import { validateViewerPackManifest, normalizePackRelativePath } from "./manifest-schema.mjs";

/**
 * Main-process installed-pack registry.
 * Publishes immutable contribution snapshots; renderers never scan disk.
 */

export function createViewerPackRegistryService({ store, now = () => new Date().toISOString() }) {
  if (!store) throw new TypeError("store is required");

  let cachedSnapshot = null;
  let cachedSequence = -1;

  async function buildContributionSnapshot() {
    await store.ensureLayout();
    const state = await store.readRegistryState();
    const contributions = [];

    for (const [pluginId, enabled] of Object.entries(state.enabled ?? {})) {
      const versionDir = store.packageVersionDir(pluginId, enabled.version);
      const manifestPath = path.join(versionDir, "manifest.json");
      let raw;
      try {
        raw = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
      } catch {
        continue;
      }
      const validated = validateViewerPackManifest(raw);
      if (!validated.ok) continue;
      contributions.push({
        pluginId,
        publisher: validated.value.publisher,
        version: enabled.version,
        label: deriveContributionLabel(validated.value),
        enabled: true,
        contentHash: enabled.contentHash,
        viewer: validated.value.viewer,
        formats: validated.value.formats,
        permissions: validated.value.permissions,
        installedAt: enabled.installedAt ?? now(),
      });
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
    if (!force && cachedSnapshot && cachedSequence === sequence) {
      return cachedSnapshot;
    }
    const snapshot = await buildContributionSnapshot();
    cachedSnapshot = Object.freeze({
      ...snapshot,
      contributions: Object.freeze(snapshot.contributions.map((item) => Object.freeze({ ...item }))),
    });
    cachedSequence = sequence;
    return cachedSnapshot;
  }

  function invalidate() {
    cachedSnapshot = null;
    cachedSequence = -1;
  }

  /**
   * Resolve a file inside an ENABLED pack's immutable version dir, but only when
   * the requested content hash matches the enabled hash. A disabled pack, a hash
   * mismatch, or a traversal attempt all throw — the `puppyone-plugin://`
   * protocol maps every one of these to an indistinguishable 404.
   */
  async function resolvePackageFile({ pluginId, contentHash, relativePath }) {
    const state = await store.readRegistryState();
    const enabled = state.enabled?.[pluginId];
    if (!enabled) {
      throw new Error("Viewer pack is not enabled.");
    }
    if (!contentHash || enabled.contentHash !== contentHash) {
      throw new Error("Viewer pack content hash mismatch.");
    }
    const normalized = normalizePackRelativePath(relativePath);
    if (!normalized.ok) {
      throw new Error(`Rejected package path (${normalized.reason}).`);
    }
    const versionDir = path.resolve(store.packageVersionDir(pluginId, enabled.version));
    const absolutePath = path.resolve(path.join(versionDir, ...normalized.path.split("/")));
    if (absolutePath !== versionDir && !absolutePath.startsWith(`${versionDir}${path.sep}`)) {
      throw new Error("Package path escapes the version directory.");
    }
    return {
      absolutePath,
      versionDir,
      pluginId,
      version: enabled.version,
      contentHash: enabled.contentHash,
      relativePath: normalized.path,
    };
  }

  return {
    getContributionSnapshot,
    invalidate,
    resolvePackageFile,
  };
}

function deriveContributionLabel(manifest) {
  const primaryFormat = manifest.formats?.[0];
  if (primaryFormat && typeof primaryFormat.label === "string" && primaryFormat.label.trim()) {
    return primaryFormat.label.trim();
  }
  return manifest.id;
}
