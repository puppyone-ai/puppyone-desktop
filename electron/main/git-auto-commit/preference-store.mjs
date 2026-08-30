import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gitAutoCommitWorkspaceKey } from "./identity.mjs";

export const GIT_AUTO_COMMIT_PREFERENCE_SCHEMA_VERSION = 1;
export const GIT_AUTO_COMMIT_MIN_INTERVAL_MS = 5 * 60 * 1000;
export const GIT_AUTO_COMMIT_MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const GIT_AUTO_COMMIT_DEFAULT_QUIET_PERIOD_MS = 60 * 1000;

const MAX_WORKSPACE_POLICIES = 256;
const EMPTY_STATE = Object.freeze({
  schemaVersion: GIT_AUTO_COMMIT_PREFERENCE_SCHEMA_VERSION,
  experimentalOptIn: false,
  workspaces: Object.freeze({}),
});

export function createGitAutoCommitPreferenceStore({
  filePath,
  fsApi = fs.promises,
  now = () => Date.now(),
  logger = console,
} = {}) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new TypeError("A Git Auto Commit preference path is required.");
  }
  const resolvedFilePath = path.resolve(filePath);
  let mutationQueue = Promise.resolve();

  async function read() {
    try {
      const metadata = await fsApi.lstat(resolvedFilePath);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 256 * 1024) {
        throw new Error("Git Auto Commit preferences are unsafe or oversized.");
      }
      const parsed = JSON.parse(await fsApi.readFile(resolvedFilePath, "utf8"));
      return normalizeState(parsed);
    } catch (error) {
      if (error?.code === "ENOENT") return cloneEmptyState();
      logger.warn?.("Unable to read Git Auto Commit preferences; failing closed.", error);
      return cloneEmptyState();
    }
  }

  async function getSnapshot(identity = null) {
    const state = await read();
    const workspaceKey = identity ? gitAutoCommitWorkspaceKey(identity) : null;
    return Object.freeze({
      experimentalOptIn: state.experimentalOptIn,
      workspaceKey,
      workspacePolicy: workspaceKey
        ? normalizePolicy(state.workspaces[workspaceKey])
        : createDefaultPolicy(),
    });
  }

  function setExperimentalOptIn(enabled) {
    return enqueue(async () => {
      const state = await read();
      const next = { ...state, experimentalOptIn: enabled === true };
      await write(next);
      return next.experimentalOptIn;
    });
  }

  function setWorkspacePolicy(identity, patch = {}) {
    const workspaceKey = gitAutoCommitWorkspaceKey(identity);
    return enqueue(async () => {
      const state = await read();
      const current = normalizePolicy(state.workspaces[workspaceKey]);
      const policy = normalizePolicy({ ...current, ...patch, updatedAt: new Date(now()).toISOString() });
      const entries = Object.entries({ ...state.workspaces, [workspaceKey]: policy })
        .sort(([, left], [, right]) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
        .slice(0, MAX_WORKSPACE_POLICIES);
      await write({ ...state, workspaces: Object.fromEntries(entries) });
      return policy;
    });
  }

  function enqueue(operation) {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.catch(() => undefined);
    return result;
  }

  async function write(value) {
    const normalized = normalizeState(value);
    const directory = path.dirname(resolvedFilePath);
    await fsApi.mkdir(directory, { recursive: true, mode: 0o700 });
    await fsApi.chmod(directory, 0o700).catch(() => undefined);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(resolvedFilePath)}.${process.pid}.${now()}.${crypto.randomBytes(6).toString("hex")}.tmp`,
    );
    let handle = null;
    try {
      handle = await fsApi.open(temporaryPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await fsApi.rename(temporaryPath, resolvedFilePath);
      await fsApi.chmod(resolvedFilePath, 0o600).catch(() => undefined);
      await syncDirectoryBestEffort(directory, fsApi);
    } finally {
      if (handle) await handle.close().catch(() => undefined);
      await fsApi.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  return Object.freeze({ getSnapshot, setExperimentalOptIn, setWorkspacePolicy });
}

function normalizeState(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== GIT_AUTO_COMMIT_PREFERENCE_SCHEMA_VERSION) {
    return cloneEmptyState();
  }
  const workspaces = {};
  if (value.workspaces && typeof value.workspaces === "object" && !Array.isArray(value.workspaces)) {
    for (const [key, policy] of Object.entries(value.workspaces).slice(0, MAX_WORKSPACE_POLICIES)) {
      if (/^[0-9a-f]{64}$/.test(key)) workspaces[key] = normalizePolicy(policy);
    }
  }
  return {
    schemaVersion: GIT_AUTO_COMMIT_PREFERENCE_SCHEMA_VERSION,
    experimentalOptIn: value.experimentalOptIn === true,
    workspaces,
  };
}

function normalizePolicy(value = {}) {
  const minimumIntervalMs = Number.isFinite(value?.minimumIntervalMs)
    ? Math.min(
        GIT_AUTO_COMMIT_MAX_INTERVAL_MS,
        Math.max(GIT_AUTO_COMMIT_MIN_INTERVAL_MS, Math.round(value.minimumIntervalMs)),
      )
    : GIT_AUTO_COMMIT_MIN_INTERVAL_MS;
  return Object.freeze({
    enabled: value?.enabled === true,
    scope: "untracked-only",
    minimumIntervalMs,
    quietPeriodMs: GIT_AUTO_COMMIT_DEFAULT_QUIET_PERIOD_MS,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  });
}

function createDefaultPolicy() {
  return normalizePolicy();
}

function cloneEmptyState() {
  return { ...EMPTY_STATE, workspaces: {} };
}

async function syncDirectoryBestEffort(directory, fsApi) {
  let handle = null;
  try {
    handle = await fsApi.open(directory, "r");
    await handle.sync();
  } catch {
    // Directory fsync support varies by platform and filesystem.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
