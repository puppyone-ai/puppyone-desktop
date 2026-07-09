import fs from "node:fs";
import path from "node:path";

export function createWorkspaceStateStore({
  app,
  filename,
  canonicalizeWorkspacePath,
  workspaceFromPath,
  logger = console,
}) {
  async function getLastWorkspaceResult() {
    const folderPath = await readLastActiveWorkspacePath();
    if (!folderPath) {
      return {
        path: null,
        workspace: null,
        error: null,
      };
    }

    try {
      return {
        path: folderPath,
        workspace: await workspaceFromPath(folderPath),
        error: null,
      };
    } catch (error) {
      return {
        path: folderPath,
        workspace: null,
        error: `Unable to reopen last workspace (${folderPath}): ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async function getRecentWorkspacesResult() {
    const state = normalizeWorkspaceState(await readWorkspaceState());
    const items = [];
    const workspaces = [];
    const errors = [];
    for (const record of state.recentWorkspaceRecords) {
      try {
        const workspace = await workspaceFromPath(record.path);
        items.push({
          workspace,
          lastOpenedAt: record.lastOpenedAt,
        });
        workspaces.push(workspace);
      } catch (error) {
        errors.push({
          path: record.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { workspaces, items, errors };
  }

  async function readLastActiveWorkspacePath() {
    const state = normalizeWorkspaceState(await readWorkspaceState());
    const candidates = [
      state.lastActiveWorkspacePath,
      state.recentWorkspacePaths[0],
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return path.resolve(candidate);
      }
    }
    return null;
  }

  async function rememberRecentWorkspacePath(folderPath) {
    const canonicalPath = await canonicalizeWorkspacePath(folderPath);
    const state = normalizeWorkspaceState(await readWorkspaceState());
    const recentWorkspaceRecords = [
      {
        path: canonicalPath,
        lastOpenedAt: new Date().toISOString(),
      },
      ...state.recentWorkspaceRecords.filter((item) => item.path !== canonicalPath),
    ].slice(0, 20);
    await writeWorkspaceState({
      lastActiveWorkspacePath: canonicalPath,
      recentWorkspacePaths: recentWorkspaceRecords.map((record) => record.path),
      recentWorkspaces: recentWorkspaceRecords,
    });
  }

  async function requireRecentWorkspacePath(folderPath) {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    const requestedPath = await canonicalizeWorkspacePath(folderPath);
    const state = normalizeWorkspaceState(await readWorkspaceState());
    for (const record of state.recentWorkspaceRecords) {
      const persistedPath = await canonicalizeWorkspacePath(record.path);
      if (persistedPath === requestedPath) return persistedPath;
    }
    throw new Error("Workspace path is not in the main-process recent workspace list.");
  }

  async function removeRecentWorkspacePath(folderPath) {
    const canonicalPath = await canonicalizeWorkspacePath(folderPath);
    const state = normalizeWorkspaceState(await readWorkspaceState());
    const recentWorkspaceRecords = state.recentWorkspaceRecords.filter((item) => item.path !== canonicalPath);
    await writeWorkspaceState({
      lastActiveWorkspacePath: recentWorkspaceRecords[0]?.path ?? null,
      recentWorkspacePaths: recentWorkspaceRecords.map((record) => record.path),
      recentWorkspaces: recentWorkspaceRecords,
    });
  }

  async function forgetLastWorkspacePath() {
    await fs.promises.rm(getWorkspaceStatePath(), { force: true });
  }

  async function readWorkspaceState() {
    try {
      const raw = await fs.promises.readFile(getWorkspaceStatePath(), "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      if (error?.code !== "ENOENT") {
        logger.warn("Unable to read puppyone workspace state:", error);
      }
      return {};
    }
  }

  async function writeWorkspaceState(state) {
    await fs.promises.mkdir(path.dirname(getWorkspaceStatePath()), { recursive: true });
    await fs.promises.writeFile(
      getWorkspaceStatePath(),
      JSON.stringify(state, null, 2),
      "utf8",
    );
  }

  function getWorkspaceStatePath() {
    return path.join(app.getPath("userData"), filename);
  }

  return {
    getLastWorkspaceResult,
    getRecentWorkspacesResult,
    readLastActiveWorkspacePath,
    rememberRecentWorkspacePath,
    requireRecentWorkspacePath,
    removeRecentWorkspacePath,
    forgetLastWorkspacePath,
  };
}

function normalizeWorkspaceTimestamp(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return timestamp.toISOString();
}

function normalizeWorkspaceRecord(value) {
  if (typeof value === "string") {
    return {
      path: value,
      lastOpenedAt: null,
    };
  }
  if (!value || typeof value !== "object") return null;
  return {
    path: value.path,
    lastOpenedAt: normalizeWorkspaceTimestamp(value.lastOpenedAt),
  };
}

function normalizeWorkspaceState(state) {
  const recentWorkspaceRecords = [];
  const addPath = (value, lastOpenedAt = null) => {
    if (typeof value !== "string" || value.trim().length === 0) return;
    const resolvedPath = path.resolve(value);
    const normalizedLastOpenedAt = normalizeWorkspaceTimestamp(lastOpenedAt);
    const existing = recentWorkspaceRecords.find((record) => record.path === resolvedPath);
    if (existing) {
      if (normalizedLastOpenedAt) existing.lastOpenedAt = normalizedLastOpenedAt;
      return;
    }
    recentWorkspaceRecords.push({
      path: resolvedPath,
      lastOpenedAt: normalizedLastOpenedAt,
    });
  };

  addPath(state?.lastActiveWorkspacePath);
  if (Array.isArray(state?.recentWorkspaces)) {
    for (const item of state.recentWorkspaces) {
      const record = normalizeWorkspaceRecord(item);
      if (record) addPath(record.path, record.lastOpenedAt);
    }
  }
  if (Array.isArray(state?.recentWorkspacePaths)) {
    for (const item of state.recentWorkspacePaths) addPath(item);
  }
  addPath(state?.lastWorkspacePath);
  const recentWorkspacePaths = recentWorkspaceRecords.map((record) => record.path);

  return {
    lastActiveWorkspacePath: recentWorkspacePaths[0] ?? null,
    recentWorkspacePaths,
    recentWorkspaceRecords,
  };
}
