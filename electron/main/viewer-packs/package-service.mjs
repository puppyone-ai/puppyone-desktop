import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  VIEWER_PACK_ARCHIVE_LIMITS,
  extractAndValidateViewerPackArchive,
  assertManifestInventory,
} from "./archive-validator.mjs";
import {
  checkViewerPackEngineCompatibility,
  isValidViewerPackId,
  validateViewerPackManifest,
} from "./manifest-schema.mjs";
import {
  parsePackageSignatureEnvelope,
  sha256Hex,
  verifyPackageSignature,
} from "./package-signature.mjs";

/** Transactional install / disable / uninstall for host-owned Viewer Packs. */

const MAX_SIGNATURE_BYTES = 16 * 1024;

export function createViewerPackPackageService({
  store,
  getTrustedSigners,
  hostVersion,
  now = () => new Date().toISOString(),
}) {
  if (!store) throw new TypeError("store is required");
  if (typeof getTrustedSigners !== "function") throw new TypeError("getTrustedSigners is required");
  if (typeof hostVersion !== "string" || !hostVersion) throw new TypeError("hostVersion is required");

  // All registry mutations are serialized in the sole main process. This keeps
  // read-modify-write updates from losing one another when multiple IPC calls
  // arrive in the same event-loop turn.
  let mutationTail = Promise.resolve();
  const serializeMutation = (operation) => {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.catch(() => undefined);
    return result;
  };

  async function installFromFiles({ archivePath, signaturePath, sourceLabel = null }) {
    return serializeMutation(async () => {
      const [archiveBytes, signatureBytes] = await Promise.all([
        readBoundedRegularFile(archivePath, VIEWER_PACK_ARCHIVE_LIMITS.maxCompressedBytes, "Viewer Pack archive"),
        readBoundedRegularFile(signaturePath, MAX_SIGNATURE_BYTES, "Viewer Pack signature"),
      ]);
      return installVerifiedBytes({
        archiveBytes,
        signatureEnvelope: signatureBytes,
        sourceLabel: sourceLabel ?? path.basename(archivePath),
      });
    });
  }

  async function installFromBytes(request) {
    return serializeMutation(() => installVerifiedBytes(request));
  }

  async function installVerifiedBytes({
    archiveBytes,
    signatureEnvelope,
    sourceLabel = "local-selection",
  }) {
    await store.ensureLayout();
    if (!Buffer.isBuffer(archiveBytes) && !(archiveBytes instanceof Uint8Array)) {
      throw new TypeError("Viewer Pack archive bytes are required.");
    }
    if (archiveBytes.byteLength === 0 || archiveBytes.byteLength > VIEWER_PACK_ARCHIVE_LIMITS.maxCompressedBytes) {
      throw new Error("Viewer Pack archive exceeds compressed size budget.");
    }
    const bytes = Buffer.from(archiveBytes);
    const parsedEnvelope = parsePackageSignatureEnvelope(signatureEnvelope);
    if (!parsedEnvelope.ok) {
      throw new Error(`Viewer Pack signature rejected (${parsedEnvelope.reason}).`);
    }
    const verified = verifyPackageSignature({
      payloadBytes: bytes,
      signatureEnvelope: parsedEnvelope.value,
      trustedSigners: getTrustedSigners(),
    });
    if (!verified.ok) {
      const message = verified.reason === "no-trusted-signers"
        ? "This build has no trusted Viewer Pack publishers configured."
        : `Viewer Pack signature rejected (${verified.reason}).`;
      throw new Error(message);
    }

    const stagingRoot = path.join(store.paths.quarantine, `stage-${process.pid}-${randomUUID()}`);
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
        throw new Error(`Invalid Viewer Pack manifest: ${validated.errors.join(", ")}`);
      }
      const manifest = validated.value;
      const compatibility = checkViewerPackEngineCompatibility(manifest, { hostVersion });
      if (!compatibility.ok) {
        throw new Error(`Viewer Pack is incompatible with this PuppyOne version (${compatibility.reason}).`);
      }
      if (manifest.publisher !== verified.signer.publisher || manifest.publisher !== verified.envelope.publisher) {
        throw new Error("Viewer Pack publisher does not match its trusted signing identity.");
      }
      assertManifestInventory(manifest, extracted.inventory);

      const pluginId = manifest.id;
      const version = manifest.version;
      const finalDir = store.packageContentDir(pluginId, version, extracted.contentHash);
      await fsp.mkdir(path.dirname(finalDir), { recursive: true, mode: 0o700 });

      let installedNewContent = false;
      try {
        await fsp.rename(extractDir, finalDir);
        installedNewContent = true;
      } catch (error) {
        if (error?.code !== "EEXIST" && error?.code !== "ENOTEMPTY") throw error;
        const existingValid = await verifyDirectoryInventory(finalDir, extracted.inventory).catch(() => false);
        if (!existingValid) {
          const corruptDir = path.join(stagingRoot, `corrupt-${randomUUID()}`);
          await makeTreeWritable(finalDir).catch(() => undefined);
          await fsp.rename(finalDir, corruptDir);
          await fsp.rename(extractDir, finalDir);
          installedNewContent = true;
        }
      }
      if (installedNewContent) await sealPackageTree(finalDir);

      const state = await store.readRegistryState();
      const previous = state.enabled?.[pluginId] ?? null;
      state.enabled = state.enabled ?? {};
      state.disabled = state.disabled ?? {};
      delete state.disabled[pluginId];
      state.enabled[pluginId] = {
        version,
        contentHash: extracted.contentHash,
        publisher: manifest.publisher,
        signerKeyId: verified.signer.keyId,
        installedAt: now(),
        sourceLabel: sanitizeSourceLabel(sourceLabel),
        packageSha256: sha256Hex(bytes),
        inventory: extracted.inventory,
      };
      state.sequence = Number(state.sequence || 0) + 1;
      try {
        await store.writeRegistryState(state);
      } catch (error) {
        if (installedNewContent) {
          await makeTreeWritable(finalDir).catch(() => undefined);
          await fsp.rm(finalDir, { recursive: true, force: true }).catch(() => undefined);
        }
        throw error;
      }
      await pruneObsoleteContent(store, pluginId, [
        { version, contentHash: extracted.contentHash },
        previous,
      ]).catch(() => undefined);

      return {
        pluginId,
        version,
        contentHash: extracted.contentHash,
        previous,
        manifest,
        signerKeyId: verified.signer.keyId,
      };
    } finally {
      await makeTreeWritable(stagingRoot).catch(() => undefined);
      await fsp.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async function disable(pluginId) {
    return serializeMutation(async () => {
      assertPluginId(pluginId);
      const state = await store.readRegistryState();
      if (!state.enabled?.[pluginId]) return { ok: false, reason: "not-enabled" };
      const previous = state.enabled[pluginId];
      delete state.enabled[pluginId];
      state.disabled = state.disabled ?? {};
      state.disabled[pluginId] = { ...previous, disabledAt: now() };
      state.sequence = Number(state.sequence || 0) + 1;
      await store.writeRegistryState(state);
      return { ok: true, previous };
    });
  }

  async function uninstall(pluginId) {
    return serializeMutation(async () => {
      assertPluginId(pluginId);
      const state = await store.readRegistryState();
      const existed = Boolean(state.enabled?.[pluginId] || state.disabled?.[pluginId]);
      if (state.enabled) delete state.enabled[pluginId];
      if (state.disabled) delete state.disabled[pluginId];
      if (existed) {
        state.sequence = Number(state.sequence || 0) + 1;
        await store.writeRegistryState(state);
      }

      const pluginDir = store.packagePluginDir(pluginId);
      await makeTreeWritable(pluginDir).catch(() => undefined);
      await fsp.rm(pluginDir, { recursive: true, force: true });
      return { ok: true, existed };
    });
  }

  return {
    installFromFiles,
    installFromBytes,
    disable,
    uninstall,
  };
}

async function readBoundedRegularFile(filePath, maxBytes, label) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new TypeError(`${label} path must be absolute.`);
  }
  const initial = await fsp.lstat(filePath).catch((error) => {
    throw new Error(`${label} cannot be opened: ${error.message}`);
  });
  if (initial.isSymbolicLink() || !initial.isFile()) {
    throw new Error(`${label} must be a regular, non-symlink file.`);
  }
  if (initial.size <= 0 || initial.size > maxBytes) {
    throw new Error(`${label} exceeds its size budget.`);
  }

  const noFollow = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
  const handle = await fsp.open(filePath, fs.constants.O_RDONLY | noFollow).catch((error) => {
    throw new Error(`${label} cannot be opened safely: ${error.message}`);
  });
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size <= 0 || stats.size > maxBytes) {
      throw new Error(`${label} exceeds its size budget.`);
    }
    const bytes = Buffer.allocUnsafe(stats.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error(`${label} changed while it was being read.`);
      offset += bytesRead;
    }
    const sentinel = Buffer.allocUnsafe(1);
    const extra = await handle.read(sentinel, 0, 1, bytes.length);
    if (extra.bytesRead !== 0) throw new Error(`${label} changed while it was being read.`);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function verifyDirectoryInventory(rootDir, inventory) {
  const expected = new Map(inventory.map((item) => [item.path, item]));
  const actualPaths = await listRegularFiles(rootDir);
  if (actualPaths.length !== expected.size) return false;
  for (const relativePath of actualPaths) {
    const item = expected.get(relativePath);
    if (!item) return false;
    const absolutePath = path.join(rootDir, ...relativePath.split("/"));
    const bytes = await fsp.readFile(absolutePath);
    if (bytes.length !== item.sizeBytes) return false;
    if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) return false;
  }
  return true;
}

async function listRegularFiles(rootDir, relative = "") {
  const directory = path.join(rootDir, relative);
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("Installed Viewer Pack contains a symbolic link.");
    if (entry.isDirectory()) files.push(...await listRegularFiles(rootDir, next));
    else if (entry.isFile()) files.push(next.replace(/\\/g, "/"));
    else throw new Error("Installed Viewer Pack contains a non-regular entry.");
  }
  return files.sort();
}

async function sealPackageTree(targetPath) {
  const metadata = await fsp.lstat(targetPath);
  if (metadata.isSymbolicLink()) throw new Error("Viewer Pack tree contains a symbolic link.");
  if (metadata.isDirectory()) {
    const children = await fsp.readdir(targetPath);
    for (const child of children) await sealPackageTree(path.join(targetPath, child));
    await fsp.chmod(targetPath, 0o500).catch(() => undefined);
    return;
  }
  if (!metadata.isFile()) throw new Error("Viewer Pack tree contains a non-regular entry.");
  await fsp.chmod(targetPath, 0o400).catch(() => undefined);
}

async function makeTreeWritable(targetPath) {
  const metadata = await fsp.lstat(targetPath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!metadata || metadata.isSymbolicLink()) return;
  if (metadata.isDirectory()) {
    await fsp.chmod(targetPath, 0o700).catch(() => undefined);
    const children = await fsp.readdir(targetPath);
    for (const child of children) await makeTreeWritable(path.join(targetPath, child));
    return;
  }
  if (metadata.isFile()) await fsp.chmod(targetPath, 0o600).catch(() => undefined);
}

function sanitizeSourceLabel(value) {
  const label = path.basename(String(value ?? "local-selection")).replace(/[\u0000-\u001f\u007f]/g, "");
  return label.slice(0, 255) || "local-selection";
}

function assertPluginId(pluginId) {
  if (!isValidViewerPackId(pluginId)) throw new TypeError("Viewer Pack id is invalid.");
}

async function pruneObsoleteContent(store, pluginId, keepRecords) {
  const keep = new Set(
    keepRecords
      .filter((record) => record?.version && record?.contentHash)
      .map((record) => `${record.version}/${record.contentHash}`),
  );
  const pluginDir = store.packagePluginDir(pluginId);
  const versions = await fsp.readdir(pluginDir, { withFileTypes: true }).catch(() => []);
  for (const versionEntry of versions) {
    if (!versionEntry.isDirectory()) continue;
    const versionDir = path.join(pluginDir, versionEntry.name);
    const contentEntries = await fsp.readdir(versionDir, { withFileTypes: true }).catch(() => []);
    for (const contentEntry of contentEntries) {
      if (!contentEntry.isDirectory() || !/^[a-f0-9]{64}$/.test(contentEntry.name)) continue;
      if (keep.has(`${versionEntry.name}/${contentEntry.name}`)) continue;
      const obsolete = path.join(versionDir, contentEntry.name);
      await makeTreeWritable(obsolete).catch(() => undefined);
      await fsp.rm(obsolete, { recursive: true, force: true }).catch(() => undefined);
    }
    const remaining = await fsp.readdir(versionDir).catch(() => ["unknown"]);
    if (remaining.length === 0) await fsp.rmdir(versionDir).catch(() => undefined);
  }
}
