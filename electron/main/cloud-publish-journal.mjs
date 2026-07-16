import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveGitRepositoryIdentity } from "../../local-api/workspace.mjs";
import { normalizeCredentialConfigSnapshot } from "./cloud-publish-git-credentials.mjs";

const JOURNAL_VERSION = 1;
const JOURNAL_KIND = "puppyone-cloud-publish";
const JOURNAL_DIRECTORY = "puppyone";
const JOURNAL_FILENAME = "pending-cloud-publish.v1.json";
const MAX_JOURNAL_BYTES = 128 * 1024;
const JOURNAL_LOCK_TIMEOUT_MS = 5_000;
const JOURNAL_LOCK_STALE_MS = 30_000;
const JOURNAL_LOCK_RETRY_MS = 20;

export const CLOUD_PUBLISH_PHASES = Object.freeze([
  "prepared",
  "project-created",
  "credential-issued",
  "remote-configured",
  "pushed",
  "compensation-pending",
  "completed",
]);

/** A durable, worktree-specific write-ahead log stored in Git's own git-dir. */
export function createCloudPublishJournal(options = {}) {
  return createWorktreeGitOperationJournal({
    ...options,
    filename: JOURNAL_FILENAME,
    normalizeEntry: normalizeJournalRecord,
    canTransition: isCloudPublishTransitionAllowed,
    prepareEntry: (record) => ({
      ...record,
      version: JOURNAL_VERSION,
      kind: JOURNAL_KIND,
    }),
  });
}

/** Shared durability primitive for every main-owned Cloud Git operation. */
export function createWorktreeGitOperationJournal({
  filename,
  normalizeEntry,
  prepareEntry = (record) => record,
  canTransition = () => true,
  fsApi = fs.promises,
  now = () => Date.now(),
  resolveRepositoryIdentity = resolveGitRepositoryIdentity,
} = {}) {
  if (typeof filename !== "string" || !/^[a-z0-9][a-z0-9.-]+\.json$/.test(filename)) {
    throw new TypeError("Cloud Git operation journal filename is invalid.");
  }
  if (typeof normalizeEntry !== "function") {
    throw new TypeError("Cloud Git operation journal normalizer is required.");
  }
  async function resolvePaths(rootPath) {
    const identity = await resolveRepositoryIdentity(rootPath);
    if (!identity?.repository || !identity.gitDir || !identity.commonDir) {
      throw createJournalError("Current workspace is not a Git repository.", "REPOSITORY_REQUIRED");
    }
    const directory = path.join(identity.gitDir, JOURNAL_DIRECTORY);
    return {
      identity,
      directory,
      journalPath: path.join(directory, filename),
    };
  }

  async function read(rootPath) {
    const paths = await resolvePaths(rootPath);
    return { ...paths, record: await readEntryAtPath(paths.journalPath, normalizeEntry, fsApi) };
  }

  async function write(rootPath, record, options = {}) {
    const paths = await resolvePaths(rootPath);
    const normalized = normalizeEntry(prepareEntry(record));
    await ensureSafeDirectory(paths.directory, fsApi);
    return withJournalLock(paths, fsApi, async () => {
      const current = await readEntryAtPath(paths.journalPath, normalizeEntry, fsApi);
      assertJournalCompareAndSwap(current, options);
      assertMonotonicJournalUpdate(current, normalized, canTransition, options);
      await writeJsonAtomic(paths.journalPath, normalized, fsApi, now, {
        createOnly: options.createOnly === true,
      });
      return { ...paths, record: normalized };
    });
  }

  async function clear(rootPath, options = {}) {
    const paths = await resolvePaths(rootPath);
    await ensureSafeDirectory(paths.directory, fsApi);
    await withJournalLock(paths, fsApi, async () => {
      const current = await readEntryAtPath(paths.journalPath, normalizeEntry, fsApi);
      if (!current) return;
      assertJournalCompareAndSwap(current, options);
      await fsApi.rm(paths.journalPath, { force: true }).catch((error) => {
        throw createJournalError("Unable to clear the Cloud Git operation journal.", "JOURNAL_IO_FAILED", error);
      });
      await syncDirectoryBestEffort(paths.directory, fsApi);
    });
  }

  return { read, write, clear, resolvePaths };
}

async function readEntryAtPath(journalPath, normalizeEntry, fsApi) {
    let metadata;
    try {
      metadata = await fsApi.lstat(journalPath);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw createJournalError("Unable to inspect the Cloud Git operation journal.", "JOURNAL_IO_FAILED", error);
    }
    if (
      !metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.size > MAX_JOURNAL_BYTES
      || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    ) {
      throw createJournalError("Cloud Git operation journal is invalid.", "JOURNAL_CORRUPT");
    }
    let raw;
    try {
      raw = await fsApi.readFile(journalPath, "utf8");
    } catch (error) {
      throw createJournalError("Unable to read the Cloud Git operation journal.", "JOURNAL_IO_FAILED", error);
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw createJournalError("Cloud Git operation journal is corrupt.", "JOURNAL_CORRUPT", error);
    }
    return normalizeEntry(value);
}

export function normalizeJournalRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createJournalError("Cloud publish journal is invalid.", "JOURNAL_CORRUPT");
  }
  if (value.version !== JOURNAL_VERSION || value.kind !== JOURNAL_KIND) {
    throw createJournalError("Cloud publish journal version is unsupported.", "JOURNAL_CORRUPT");
  }
  const phase = requireEnum(value.phase, CLOUD_PUBLISH_PHASES, "phase");
  const operationId = requireUuid(value.operation_id, "operation_id");
  const apiBaseUrl = requireString(value.api_base_url, "api_base_url");
  const apiOrigin = requireString(value.api_origin, "api_origin");
  const userId = requireString(value.user_id, "user_id");
  const organizationId = requireString(value.organization_id, "organization_id");
  const projectName = requireString(value.project_name, "project_name");
  const repositoryFingerprint = requireString(value.repository_fingerprint, "repository_fingerprint");
  const expectedHeadCommitId = requireCommitId(value.expected_head_commit_id);
  const expectedBranch = requireString(value.expected_branch, "expected_branch");
  if (value.destination_branch !== "main") {
    throw createJournalError("Cloud publish destination branch is invalid.", "JOURNAL_CORRUPT");
  }
  const createPayload = value.create_payload;
  if (
    !createPayload
    || typeof createPayload !== "object"
    || Array.isArray(createPayload)
    || createPayload.org_id !== organizationId
    || createPayload.name !== projectName
    || createPayload.description !== null
    || Object.keys(createPayload).sort().join(",") !== "description,name,org_id"
  ) {
    throw createJournalError("Cloud publish create payload is invalid.", "JOURNAL_CORRUPT");
  }
  return {
    version: JOURNAL_VERSION,
    kind: JOURNAL_KIND,
    operation_id: operationId,
    revision: requireRevision(value.revision),
    phase,
    api_base_url: apiBaseUrl,
    api_origin: apiOrigin,
    user_id: userId,
    organization_id: organizationId,
    project_name: projectName,
    create_payload: {
      org_id: organizationId,
      name: projectName,
      description: null,
    },
    repository_fingerprint: repositoryFingerprint,
    expected_head_commit_id: expectedHeadCommitId,
    expected_branch: expectedBranch,
    destination_branch: "main",
    project_id: optionalString(value.project_id, "project_id"),
    credential_id: optionalString(value.credential_id, "credential_id"),
    secret_ref: optionalUuid(value.secret_ref, "secret_ref"),
    secret_stored: value.secret_stored === true,
    canonical_remote_url: optionalString(value.canonical_remote_url, "canonical_remote_url"),
    credential_username: optionalString(value.credential_username, "credential_username"),
    credential_config_snapshot: value.credential_config_snapshot == null
      ? null
      : normalizeCredentialConfigSnapshot(value.credential_config_snapshot),
    remote_add_intent: value.remote_add_intent === true,
    remote_created_by_operation: value.remote_created_by_operation === true,
    created_at: requireIso(value.created_at, "created_at"),
    updated_at: requireIso(value.updated_at, "updated_at"),
  };
}

async function ensureSafeDirectory(directory, fsApi) {
  await fsApi.mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await fsApi.lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw createJournalError("Cloud publish journal directory is unsafe.", "JOURNAL_IO_FAILED");
  }
  await fsApi.chmod(directory, 0o700).catch(() => undefined);
}

async function withJournalLock(paths, fsApi, operation) {
  const lockPath = `${paths.journalPath}.lock`;
  const startedAt = Date.now();
  let handle = null;
  while (!handle) {
    try {
      handle = await fsApi.open(lockPath, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      await handle.sync();
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw createJournalError("Unable to lock the Cloud Git operation journal.", "JOURNAL_IO_FAILED", error);
      }
      const stale = await fsApi.lstat(lockPath)
        .then((metadata) => Date.now() - metadata.mtimeMs > JOURNAL_LOCK_STALE_MS)
        .catch(() => false);
      if (stale) {
        await fsApi.rm(lockPath, { force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt >= JOURNAL_LOCK_TIMEOUT_MS) {
        throw createJournalError("Cloud Git operation journal is busy.", "JOURNAL_IO_FAILED");
      }
      await new Promise((resolve) => setTimeout(resolve, JOURNAL_LOCK_RETRY_MS));
    }
  }
  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await fsApi.rm(lockPath, { force: true }).catch(() => undefined);
  }
}

function assertJournalCompareAndSwap(current, options) {
  if (options.createOnly === true) {
    if (!current) return;
    throw createJournalError(
      "A Cloud Git operation is already pending for this worktree.",
      "IDENTITY_MISMATCH",
    );
  }
  if (!current) {
    throw createJournalError("Pending Cloud Git operation disappeared.", "IDENTITY_MISMATCH");
  }
  if (
    (options.expectedOperationId && current.operation_id !== options.expectedOperationId)
    || (Number.isInteger(options.expectedRevision) && current.revision !== options.expectedRevision)
    || (options.expectedPhase && current.phase !== options.expectedPhase)
  ) {
    throw createJournalError(
      "Pending Cloud Git operation changed in another Desktop process.",
      "IDENTITY_MISMATCH",
    );
  }
}

function assertMonotonicJournalUpdate(current, next, canTransition, options) {
  if (options.createOnly === true) {
    if (Number.isSafeInteger(next.revision) && next.revision !== 0) {
      throw createJournalError("New Cloud Git operation revision must start at zero.", "JOURNAL_CORRUPT");
    }
    return;
  }
  if (
    next.operation_id !== current.operation_id
    || (Number.isSafeInteger(current.revision) && next.revision !== current.revision + 1)
    || !canTransition(current.phase, next.phase)
  ) {
    throw createJournalError(
      "Cloud Git operation journal update is not monotonic.",
      "IDENTITY_MISMATCH",
    );
  }
}

function isCloudPublishTransitionAllowed(from, to) {
  const transitions = {
    prepared: ["prepared", "project-created", "compensation-pending"],
    "project-created": ["project-created", "credential-issued", "compensation-pending"],
    "credential-issued": ["credential-issued", "remote-configured", "compensation-pending"],
    "remote-configured": ["remote-configured", "pushed", "compensation-pending"],
    "compensation-pending": ["compensation-pending", "pushed"],
    pushed: ["pushed", "completed"],
    completed: ["completed"],
  };
  return transitions[from]?.includes(to) === true;
}

async function writeJsonAtomic(filePath, value, fsApi, now, { createOnly }) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${now()}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );
  let handle = null;
  let linked = false;
  try {
    handle = await fsApi.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    if (createOnly) {
      try {
        await fsApi.link(temporaryPath, filePath);
        linked = true;
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw createJournalError(
            "A Cloud publish operation is already pending for this worktree.",
            "JOURNAL_IO_FAILED",
            error,
          );
        }
        throw error;
      }
    } else {
      await fsApi.rename(temporaryPath, filePath);
    }
    await fsApi.chmod(filePath, 0o600).catch(() => undefined);
    await syncDirectoryBestEffort(directory, fsApi);
  } catch (error) {
    if (error?.publishCode) throw error;
    throw createJournalError("Unable to persist the Cloud publish journal.", "JOURNAL_IO_FAILED", error);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    if (linked || createOnly) {
      await fsApi.rm(temporaryPath, { force: true }).catch(() => undefined);
    } else {
      await fsApi.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

async function syncDirectoryBestEffort(directory, fsApi) {
  let handle = null;
  try {
    handle = await fsApi.open(directory, "r");
    await handle.sync();
  } catch {
    // Best effort on platforms/filesystems that do not support directory fsync.
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw createJournalError(`Cloud publish journal field '${field}' is invalid.`, "JOURNAL_CORRUPT");
  }
  return value.trim();
}

function optionalString(value, field) {
  return value === null || value === undefined ? null : requireString(value, field);
}

function requireUuid(value, field) {
  const normalized = requireString(value, field).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw createJournalError(`Cloud publish journal field '${field}' is invalid.`, "JOURNAL_CORRUPT");
  }
  return normalized;
}

function optionalUuid(value, field) {
  return value === null || value === undefined ? null : requireUuid(value, field);
}

function requireCommitId(value) {
  const normalized = requireString(value, "expected_head_commit_id").toLowerCase();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(normalized)) {
    throw createJournalError("Cloud publish expected commit id is invalid.", "JOURNAL_CORRUPT");
  }
  return normalized;
}

function requireRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw createJournalError("Cloud publish journal revision is invalid.", "JOURNAL_CORRUPT");
  }
  return value;
}

function requireIso(value, field) {
  const normalized = requireString(value, field);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw createJournalError(`Cloud publish journal field '${field}' is invalid.`, "JOURNAL_CORRUPT");
  }
  return parsed.toISOString();
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw createJournalError(`Cloud publish journal field '${field}' is invalid.`, "JOURNAL_CORRUPT");
  }
  return value;
}

function createJournalError(message, publishCode, cause = undefined) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.publishCode = publishCode;
  return error;
}
