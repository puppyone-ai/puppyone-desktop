import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveGitRepositoryIdentity } from "../../local-api/workspace.mjs";

const JOURNAL_VERSION = 1;
const JOURNAL_KIND = "puppyone-cloud-publish";
const JOURNAL_DIRECTORY = "puppyone";
const JOURNAL_FILENAME = "pending-cloud-publish.v1.json";
const MAX_JOURNAL_BYTES = 128 * 1024;

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
export function createCloudPublishJournal({
  fsApi = fs.promises,
  now = () => Date.now(),
  resolveRepositoryIdentity = resolveGitRepositoryIdentity,
} = {}) {
  async function resolvePaths(rootPath) {
    const identity = await resolveRepositoryIdentity(rootPath);
    if (!identity?.repository || !identity.gitDir || !identity.commonDir) {
      throw createJournalError("Current workspace is not a Git repository.", "REPOSITORY_REQUIRED");
    }
    const directory = path.join(identity.gitDir, JOURNAL_DIRECTORY);
    return {
      identity,
      directory,
      journalPath: path.join(directory, JOURNAL_FILENAME),
    };
  }

  async function read(rootPath) {
    const paths = await resolvePaths(rootPath);
    let metadata;
    try {
      metadata = await fsApi.lstat(paths.journalPath);
    } catch (error) {
      if (error?.code === "ENOENT") return { ...paths, record: null };
      throw createJournalError("Unable to inspect the Cloud publish journal.", "JOURNAL_IO_FAILED", error);
    }
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_JOURNAL_BYTES) {
      throw createJournalError("Cloud publish journal is invalid.", "JOURNAL_CORRUPT");
    }
    let raw;
    try {
      raw = await fsApi.readFile(paths.journalPath, "utf8");
    } catch (error) {
      throw createJournalError("Unable to read the Cloud publish journal.", "JOURNAL_IO_FAILED", error);
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw createJournalError("Cloud publish journal is corrupt.", "JOURNAL_CORRUPT", error);
    }
    return { ...paths, record: normalizeJournalRecord(value) };
  }

  async function write(rootPath, record, options = {}) {
    const paths = await resolvePaths(rootPath);
    const normalized = normalizeJournalRecord({
      ...record,
      version: JOURNAL_VERSION,
      kind: JOURNAL_KIND,
    });
    await ensureSafeDirectory(paths.directory, fsApi);
    await writeJsonAtomic(paths.journalPath, normalized, fsApi, now, {
      createOnly: options.createOnly === true,
    });
    return { ...paths, record: normalized };
  }

  async function clear(rootPath) {
    const paths = await resolvePaths(rootPath);
    await fsApi.rm(paths.journalPath, { force: true }).catch((error) => {
      throw createJournalError("Unable to clear the Cloud publish journal.", "JOURNAL_IO_FAILED", error);
    });
    await syncDirectoryBestEffort(paths.directory, fsApi);
  }

  return { read, write, clear, resolvePaths };
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
    || createPayload.seed !== false
    || Object.keys(createPayload).sort().join(",") !== "description,name,org_id,seed"
  ) {
    throw createJournalError("Cloud publish create payload is invalid.", "JOURNAL_CORRUPT");
  }
  return {
    version: JOURNAL_VERSION,
    kind: JOURNAL_KIND,
    operation_id: operationId,
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
      seed: false,
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
