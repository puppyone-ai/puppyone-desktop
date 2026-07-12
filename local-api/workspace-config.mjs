import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  isSameOrInsidePath,
  resolveExistingWorkspacePath,
} from "./files/path-policy.mjs";

const PUPPYONE_CONFIG_DIR = ".puppyone";
const PUPPYONE_CONFIG_FILE = "config.json";

const DEFAULT_PUPPYONE_WORKSPACE_CONFIG = Object.freeze({
  version: 2,
  project: {
    id: null,
    workspaceInstanceId: null,
  },
  sync: {
    sourceOfTruth: {
      service: "github",
      remote: null,
      branch: null,
    },
  },
  git: {
    primaryRemote: null,
    watchedBranch: null,
  },
  backup: {
    enabled: false,
    service: "github",
    remote: null,
    branch: null,
  },
  cloud: {
    projectId: null,
    origin: null,
    bindingId: null,
  },
});

export async function readPuppyoneWorkspaceConfig(rootPath) {
  const root = await resolveExistingWorkspacePath(rootPath, null);
  const configDir = path.join(root, PUPPYONE_CONFIG_DIR);
  const configPath = path.join(root, PUPPYONE_CONFIG_DIR, PUPPYONE_CONFIG_FILE);
  const configDirMetadata = await fs.lstat(configDir).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Unable to inspect PuppyOne config directory: ${error.message}`);
  });
  if (!configDirMetadata) return normalizePuppyoneWorkspaceConfig(null);
  if (configDirMetadata.isSymbolicLink() || !configDirMetadata.isDirectory()) {
    throw new Error("PuppyOne config directory must be a real directory inside the workspace.");
  }
  const configMetadata = await fs.lstat(configPath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Unable to inspect PuppyOne config: ${error.message}`);
  });
  if (!configMetadata) return normalizePuppyoneWorkspaceConfig(null);
  if (configMetadata.isSymbolicLink() || !configMetadata.isFile()) {
    throw new Error("PuppyOne config must be a regular file inside the workspace.");
  }
  const rawConfig = await fs.readFile(configPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Unable to read PuppyOne config: ${error.message}`);
  });

  if (!rawConfig) return normalizePuppyoneWorkspaceConfig(null);

  try {
    return normalizePuppyoneWorkspaceConfig(JSON.parse(rawConfig));
  } catch (error) {
    throw new Error(`Unable to parse PuppyOne config: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writePuppyoneWorkspaceConfig(rootPath, config) {
  const root = await resolveExistingWorkspacePath(rootPath, null);
  const configDir = path.join(root, PUPPYONE_CONFIG_DIR);
  const existingConfig = await readPuppyoneWorkspaceConfig(root);
  const projectId = normalizeWorkspaceProjectId(config?.project?.id)
    ?? existingConfig.project.id
    ?? crypto.randomUUID();
  const normalizedConfig = normalizePuppyoneWorkspaceConfig(config, {
    updatedAt: new Date().toISOString(),
    projectId,
  });

  await fs.mkdir(configDir, { recursive: false }).catch((error) => {
    if (error?.code === "EEXIST") return;
    throw new Error(`Unable to create PuppyOne config directory: ${error.message}`);
  });
  const configDirMetadata = await fs.lstat(configDir).catch((error) => {
    throw new Error(`Unable to inspect PuppyOne config directory: ${error.message}`);
  });
  if (configDirMetadata.isSymbolicLink() || !configDirMetadata.isDirectory()) {
    throw new Error("PuppyOne config directory must be a real directory inside the workspace.");
  }
  const canonicalConfigDir = await fs.realpath(configDir);
  if (!isSameOrInsidePath(root, canonicalConfigDir)) {
    throw new Error("PuppyOne config directory resolves outside the workspace.");
  }

  const configPath = path.join(canonicalConfigDir, PUPPYONE_CONFIG_FILE);
  const existingMetadata = await fs.lstat(configPath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Unable to inspect PuppyOne config: ${error.message}`);
  });
  if (existingMetadata?.isSymbolicLink() || (existingMetadata && !existingMetadata.isFile())) {
    throw new Error("PuppyOne config must be a regular file inside the workspace.");
  }

  const temporaryPath = path.join(
    canonicalConfigDir,
    `.config.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  let handle = null;
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(normalizedConfig, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, configPath);
    await fs.chmod(configPath, 0o600).catch(() => undefined);
    await syncDirectoryBestEffort(canonicalConfigDir);
  } catch (error) {
    throw new Error(`Unable to write PuppyOne config: ${error.message}`);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }

  return normalizedConfig;
}

export async function regeneratePuppyoneWorkspaceProjectId(rootPath, options = {}) {
  const current = await readPuppyoneWorkspaceConfig(rootPath);
  return writePuppyoneWorkspaceConfig(rootPath, {
    ...current,
    project: {
      ...current.project,
      id: crypto.randomUUID(),
    },
    cloud: {
      ...current.cloud,
      projectId: options.preserveCloudBinding === true ? current.cloud.projectId : null,
      origin: options.preserveCloudBinding === true ? current.cloud.origin : null,
      bindingId: options.preserveCloudBinding === true ? current.cloud.bindingId : null,
    },
  });
}

export function normalizePuppyoneWorkspaceConfig(value, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const sourceVersion = Number(source.version ?? 1);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1 || sourceVersion > 2) {
    throw new Error(`Unsupported PuppyOne config version: ${String(source.version)}`);
  }
  const project = source.project && typeof source.project === "object" ? source.project : {};
  const sync = source.sync && typeof source.sync === "object" ? source.sync : {};
  const sourceOfTruth = sync.sourceOfTruth && typeof sync.sourceOfTruth === "object" ? sync.sourceOfTruth : {};
  const git = source.git && typeof source.git === "object" ? source.git : {};
  const backup = source.backup && typeof source.backup === "object" ? source.backup : {};
  const cloud = source.cloud && typeof source.cloud === "object" ? source.cloud : {};
  const primaryRemote = normalizeOptionalConfigText(git.primaryRemote);
  const watchedBranch = normalizeOptionalConfigText(git.watchedBranch);
  const sourceOfTruthService = normalizeBackendService(sourceOfTruth.service ?? backup.service);
  const isPuppyoneSource = sourceOfTruthService === "puppyone";
  const sourceOfTruthRemote =
    normalizeOptionalConfigText(sourceOfTruth.remote)
    ?? primaryRemote
    ?? normalizeOptionalConfigText(backup.remote);
  const sourceOfTruthBranch = isPuppyoneSource
    ? null
    : normalizeOptionalConfigText(sourceOfTruth.branch)
      ?? watchedBranch
      ?? normalizeOptionalConfigText(backup.branch);
  const updatedAt = typeof options.updatedAt === "string"
    ? options.updatedAt
    : typeof source.updatedAt === "string"
      ? source.updatedAt
      : undefined;
  const projectId = options.projectId
    ?? normalizeWorkspaceProjectId(project.id, { strict: true });

  return {
    ...source,
    ...DEFAULT_PUPPYONE_WORKSPACE_CONFIG,
    version: 2,
    project: {
      ...project,
      id: projectId,
      workspaceInstanceId: normalizeWorkspaceInstanceId(project.workspaceInstanceId),
    },
    sync: {
      ...sync,
      sourceOfTruth: {
        ...sourceOfTruth,
        service: sourceOfTruthService,
        remote: sourceOfTruthRemote,
        branch: sourceOfTruthBranch,
      },
    },
    git: {
      ...git,
      primaryRemote: primaryRemote ?? sourceOfTruthRemote,
      watchedBranch: isPuppyoneSource ? null : watchedBranch ?? sourceOfTruthBranch,
    },
    backup: {
      ...backup,
      enabled: backup.enabled === true || cloud.backupEnabled === true,
      service: normalizeBackendService(backup.service ?? sourceOfTruthService),
      remote: normalizeOptionalConfigText(backup.remote) ?? sourceOfTruthRemote,
      branch: normalizeOptionalConfigText(backup.branch) ?? (isPuppyoneSource ? null : sourceOfTruthBranch),
    },
    cloud: {
      ...cloud,
      projectId: normalizeOptionalConfigText(cloud.projectId),
      origin: normalizeCloudBindingOrigin(cloud.origin),
      bindingId: normalizeOptionalConfigText(cloud.bindingId),
    },
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function normalizeWorkspaceProjectId(value, { strict = false } = {}) {
  if (value == null || value === "") return null;
  const normalized = normalizeOptionalConfigText(value);
  const valid = normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
  if (valid) return normalized.toLowerCase();
  if (strict || normalized) throw new Error("PuppyOne project.id must be a valid UUID.");
  return null;
}

function normalizeWorkspaceInstanceId(value) {
  const normalized = normalizeOptionalConfigText(value);
  if (!normalized) return null;
  if (normalized.length < 16 || normalized.length > 200 || /\s/.test(normalized)) {
    throw new Error("PuppyOne project.workspaceInstanceId is invalid.");
  }
  return normalized;
}

function normalizeCloudBindingOrigin(value) {
  const normalized = normalizeOptionalConfigText(value);
  if (!normalized) return null;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("PuppyOne cloud.origin must be an HTTP(S) origin.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("PuppyOne cloud.origin must be an HTTP(S) origin.");
  }
  return parsed.origin.toLowerCase();
}

function normalizeBackendService(value) {
  return value === "github" || value === "custom" || value === "puppyone" ? value : "github";
}

function normalizeOptionalConfigText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function syncDirectoryBestEffort(directory) {
  const handle = await fs.open(directory, "r").catch(() => null);
  if (!handle) return;
  try {
    await handle.sync().catch(() => undefined);
  } finally {
    await handle.close().catch(() => undefined);
  }
}
