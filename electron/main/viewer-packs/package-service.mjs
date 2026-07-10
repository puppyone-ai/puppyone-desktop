import fsp from "node:fs/promises";
import path from "node:path";
import { extractAndValidateViewerPackArchive, assertManifestInventory } from "./archive-validator.mjs";
import { validateViewerPackManifest } from "./manifest-schema.mjs";
import { sha256Hex, verifyAgainstPinnedKeys } from "./package-signature.mjs";

/**
 * Install / disable / uninstall Viewer Packs into the host-owned store.
 * Never executes from the user-selected or download path.
 */

export function createViewerPackPackageService({
  store,
  getPublicKeys,
  now = () => new Date().toISOString(),
}) {
  if (!store) throw new TypeError("store is required");
  if (typeof getPublicKeys !== "function") throw new TypeError("getPublicKeys is required");

  async function installFromBytes({
    archiveBytes,
    signatureBase64Url,
    expectedSha256 = null,
    sourceLabel = "local-selection",
  }) {
    await store.ensureLayout();
    const bytes = Buffer.from(archiveBytes);
    const digest = sha256Hex(bytes);
    if (expectedSha256 && expectedSha256 !== digest) {
      throw new Error("Viewer pack SHA-256 mismatch.");
    }

    const keys = getPublicKeys();
    const verified = verifyAgainstPinnedKeys({
      payloadBytes: bytes,
      signatureBase64Url,
      publicKeys: keys,
    });
    if (!verified.ok) {
      throw new Error(`Viewer pack signature rejected (${verified.reason}).`);
    }

    const stagingRoot = path.join(store.paths.quarantine, `stage-${process.pid}-${Date.now()}`);
    const extractDir = path.join(stagingRoot, "extract");
    try {
      const extracted = await extractAndValidateViewerPackArchive({
        archiveBytes: bytes,
        destinationDir: extractDir,
      });

      const manifestRaw = JSON.parse(
        await fsp.readFile(path.join(extractDir, "manifest.json"), "utf8"),
      );
      const validated = validateViewerPackManifest(manifestRaw);
      if (!validated.ok) {
        throw new Error(`Invalid viewer pack manifest: ${validated.errors.join(", ")}`);
      }
      assertManifestInventory(validated.value, extracted.inventory);

      const pluginId = validated.value.id;
      const version = validated.value.version;
      const finalDir = store.packageVersionDir(pluginId, version);
      await fsp.mkdir(path.dirname(finalDir), { recursive: true });
      await fsp.rm(finalDir, { recursive: true, force: true });
      await fsp.rename(extractDir, finalDir);

      const state = await store.readRegistryState();
      const previous = state.enabled?.[pluginId] ?? null;
      state.enabled = state.enabled ?? {};
      state.enabled[pluginId] = {
        version,
        contentHash: extracted.contentHash,
        publisher: validated.value.publisher,
        installedAt: now(),
        sourceLabel,
        packageSha256: digest,
      };
      state.sequence = Number(state.sequence || 0) + 1;
      await store.writeRegistryState(state);

      return {
        pluginId,
        version,
        contentHash: extracted.contentHash,
        previous,
        manifest: validated.value,
      };
    } finally {
      await fsp.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async function disable(pluginId) {
    const state = await store.readRegistryState();
    if (!state.enabled?.[pluginId]) return { ok: false, reason: "not-enabled" };
    const previous = state.enabled[pluginId];
    delete state.enabled[pluginId];
    state.disabled = state.disabled ?? {};
    state.disabled[pluginId] = { ...previous, disabledAt: now() };
    state.sequence = Number(state.sequence || 0) + 1;
    await store.writeRegistryState(state);
    return { ok: true, previous };
  }

  async function uninstall(pluginId) {
    await disable(pluginId);
    const pluginDir = path.join(store.paths.packages, pluginId);
    await fsp.rm(pluginDir, { recursive: true, force: true });
    return { ok: true };
  }

  return {
    installFromBytes,
    disable,
    uninstall,
  };
}
