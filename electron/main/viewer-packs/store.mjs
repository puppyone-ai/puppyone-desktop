import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isValidViewerPackId, isValidViewerPackVersion } from "./manifest-schema.mjs";

/** Host-owned, per-machine Viewer Pack store under Electron userData. */

const CONTENT_HASH_RE = /^[a-f0-9]{64}$/;

export function createViewerPackStore({ userDataPath }) {
  if (typeof userDataPath !== "string" || !userDataPath.trim()) {
    throw new TypeError("userDataPath is required for the viewer pack store.");
  }

  const root = path.join(path.resolve(userDataPath), "viewer-packs");
  const paths = Object.freeze({
    root,
    registryState: path.join(root, "registry-state.json"),
    grants: path.join(root, "grants.json"),
    packages: path.join(root, "packages"),
    downloads: path.join(root, "downloads"),
    quarantine: path.join(root, "quarantine"),
  });
  let layoutPromise = null;

  async function ensureLayout() {
    if (!layoutPromise) {
      layoutPromise = initializeLayout().catch((error) => {
        layoutPromise = null;
        throw error;
      });
    }
    await layoutPromise;
  }

  async function initializeLayout() {
    await fsp.mkdir(paths.root, { recursive: true, mode: 0o700 });
    await Promise.all([
      fsp.mkdir(paths.packages, { recursive: true, mode: 0o700 }),
      fsp.mkdir(paths.downloads, { recursive: true, mode: 0o700 }),
      fsp.mkdir(paths.quarantine, { recursive: true, mode: 0o700 }),
    ]);
    await Promise.all([
      fsp.chmod(paths.root, 0o700).catch(() => undefined),
      fsp.chmod(paths.packages, 0o700).catch(() => undefined),
      fsp.chmod(paths.downloads, 0o700).catch(() => undefined),
      fsp.chmod(paths.quarantine, 0o700).catch(() => undefined),
    ]);
    await createJsonIfMissing(paths.registryState, {
      schemaVersion: 1,
      sequence: 0,
      enabled: {},
      disabled: {},
      updatedAt: new Date().toISOString(),
    });
    await createJsonIfMissing(paths.grants, {
      schemaVersion: 1,
      grants: {},
      updatedAt: new Date().toISOString(),
    });
  }

  async function readRegistryState() {
    await ensureLayout();
    const state = await readJson(paths.registryState);
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("Viewer Pack registry state is corrupt.");
    }
    return state;
  }

  async function writeRegistryState(state) {
    await ensureLayout();
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new TypeError("Viewer Pack registry state must be an object.");
    }
    await writeJsonAtomic(paths.registryState, {
      ...state,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    });
  }

  function packagePluginDir(pluginId) {
    assertPluginId(pluginId);
    return resolveChild(paths.packages, pluginId);
  }

  function packageVersionDir(pluginId, version) {
    assertPluginId(pluginId);
    assertVersion(version);
    return resolveChild(packagePluginDir(pluginId), version);
  }

  function packageContentDir(pluginId, version, contentHash) {
    assertContentHash(contentHash);
    return resolveChild(packageVersionDir(pluginId, version), contentHash);
  }

  return {
    paths,
    ensureLayout,
    readRegistryState,
    writeRegistryState,
    packagePluginDir,
    packageVersionDir,
    packageContentDir,
    async listInstalledVersions(pluginId) {
      const pluginDir = packagePluginDir(pluginId);
      if (!fs.existsSync(pluginDir)) return [];
      const entries = await fsp.readdir(pluginDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && isValidViewerPackVersion(entry.name))
        .map((entry) => entry.name)
        .sort();
    },
  };
}

async function createJsonIfMissing(filePath, value) {
  try {
    const handle = await fsp.open(filePath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fsp.open(tempPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fsp.rename(tempPath, filePath);
    // Persist the directory entry on filesystems that support directory fsync.
    const directoryHandle = await fsp.open(dir, "r").catch(() => null);
    if (directoryHandle) {
      try {
        await directoryHandle.sync().catch(() => undefined);
      } finally {
        await directoryHandle.close();
      }
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

function assertPluginId(pluginId) {
  if (!isValidViewerPackId(pluginId)) throw new TypeError("Viewer Pack id is invalid.");
}

function assertVersion(version) {
  if (!isValidViewerPackVersion(version)) throw new TypeError("Viewer Pack version is invalid.");
}

function assertContentHash(contentHash) {
  if (typeof contentHash !== "string" || !CONTENT_HASH_RE.test(contentHash)) {
    throw new TypeError("Viewer Pack content hash is invalid.");
  }
}

function resolveChild(parent, segment) {
  const resolvedParent = path.resolve(parent);
  const child = path.resolve(resolvedParent, segment);
  if (child === resolvedParent || !child.startsWith(`${resolvedParent}${path.sep}`)) {
    throw new Error("Viewer Pack store path escapes its parent.");
  }
  return child;
}
