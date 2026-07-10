import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Host-owned Viewer Pack store under userData.
 * Workspace folders are never discovery roots.
 */

export function createViewerPackStore({ userDataPath }) {
  if (typeof userDataPath !== "string" || !userDataPath.trim()) {
    throw new TypeError("userDataPath is required for the viewer pack store.");
  }

  const root = path.join(path.resolve(userDataPath), "viewer-packs");
  const paths = {
    root,
    registryState: path.join(root, "registry-state.json"),
    grants: path.join(root, "grants.json"),
    packages: path.join(root, "packages"),
    downloads: path.join(root, "downloads"),
    quarantine: path.join(root, "quarantine"),
  };

  async function ensureLayout() {
    await fsp.mkdir(paths.packages, { recursive: true });
    await fsp.mkdir(paths.downloads, { recursive: true });
    await fsp.mkdir(paths.quarantine, { recursive: true });
    if (!fs.existsSync(paths.registryState)) {
      await writeJsonAtomic(paths.registryState, {
        sequence: 0,
        enabled: {},
        updatedAt: new Date().toISOString(),
      });
    }
    if (!fs.existsSync(paths.grants)) {
      await writeJsonAtomic(paths.grants, { grants: {}, updatedAt: new Date().toISOString() });
    }
  }

  async function readRegistryState() {
    await ensureLayout();
    return readJson(paths.registryState);
  }

  async function writeRegistryState(state) {
    await ensureLayout();
    await writeJsonAtomic(paths.registryState, {
      ...state,
      updatedAt: new Date().toISOString(),
    });
  }

  function packageVersionDir(pluginId, version) {
    return path.join(paths.packages, pluginId, version);
  }

  return {
    paths,
    ensureLayout,
    readRegistryState,
    writeRegistryState,
    packageVersionDir,
    async listInstalledVersions(pluginId) {
      const pluginDir = path.join(paths.packages, pluginId);
      if (!fs.existsSync(pluginDir)) return [];
      const entries = await fsp.readdir(pluginDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    },
  };
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fsp.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fsp.rename(tempPath, filePath);
}
