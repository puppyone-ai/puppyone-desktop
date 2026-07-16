import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveGitRepositoryIdentity } from "../../local-api/workspace.mjs";
import { normalizeCloudApiBaseUrl } from "../../shared/cloudEndpoint.js";

export const CLOUD_REMOTE_NAME = "puppyone";
export const CLOUD_DESTINATION_BRANCH = "main";
export const CLOUD_GIT_USERNAME = "x-puppyone-token";
export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const COMMIT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export const CLOUD_PUBLISH_ERROR_CODES = Object.freeze([
  "SESSION_REQUIRED",
  "IDENTITY_MISMATCH",
  "ORGANIZATION_REQUIRED",
  "REPOSITORY_REQUIRED",
  "COMMIT_REQUIRED",
  "BRANCH_REQUIRED",
  "MERGE_TIP_UNSUPPORTED",
  "LFS_UNSUPPORTED",
  "REMOTE_CONFLICT",
  "PROJECT_CREATE_FAILED",
  "CREDENTIAL_FAILED",
  "REMOTE_CONFIG_FAILED",
  "PUSH_FAILED",
  "COMPENSATION_FAILED",
  "JOURNAL_CORRUPT",
  "JOURNAL_IO_FAILED",
  "PERMISSION_DENIED",
  "UNKNOWN",
]);

export function normalizeReadRequest(request) {
  return {
    rootPath: requireString(request.rootPath, "REPOSITORY_REQUIRED", "Workspace path is required."),
    apiBaseUrl: requireApiBase(request.apiBaseUrl),
    userId: requireString(request.userId, "SESSION_REQUIRED", "Cloud user identity is required."),
  };
}

export function normalizeStartRequest(request) {
  const base = normalizeReadRequest(request);
  const organizationId = requireString(
    request.organizationId,
    "ORGANIZATION_REQUIRED",
    "Select a PuppyOne organization before publishing.",
  );
  const projectName = requireString(request.projectName, "IDENTITY_MISMATCH", "Cloud Project name is required.");
  if (projectName.length > 200) {
    throw createPublishError("IDENTITY_MISMATCH", "Cloud Project name is too long.", false);
  }
  const expectedHeadCommitId = requireCommitId(request.expectedHeadCommitId);
  const expectedBranch = requireString(request.expectedBranch, "BRANCH_REQUIRED", "Current Git branch is required.");
  return { ...base, organizationId, projectName, expectedHeadCommitId, expectedBranch };
}

export function normalizeAbandonRequest(request) {
  const base = normalizeReadRequest(request);
  const operationId = requireString(request.operationId, "IDENTITY_MISMATCH", "Publish operation id is required.");
  if (!UUID_V4_PATTERN.test(operationId)) {
    throw createPublishError("IDENTITY_MISMATCH", "Publish operation id is invalid.", false);
  }
  return { ...base, operationId: operationId.toLowerCase() };
}

export async function resolveRepositoryContext(rootPath, {
  resolveRepositoryIdentity = resolveGitRepositoryIdentity,
  fsApi = fs.promises,
} = {}) {
  const identity = await resolveRepositoryIdentity(rootPath);
  if (!identity?.repository || !identity.gitDir || !identity.commonDir) {
    throw createPublishError("REPOSITORY_REQUIRED", "Current workspace is not a Git repository.", false);
  }
  const canonicalRoot = path.resolve(rootPath);
  const metadata = await fsApi.stat(identity.commonDir).catch((error) => {
    throw createPublishError("REPOSITORY_REQUIRED", "Unable to inspect the Git repository.", false, error);
  });
  const repositoryFingerprint = crypto.createHash("sha256").update([
    "puppyone-publish-repository-v1",
    String(metadata.dev),
    String(metadata.ino),
    path.resolve(identity.commonDir),
    path.resolve(identity.gitDir),
    path.resolve(identity.topLevel ?? canonicalRoot),
  ].join("\0")).digest("hex");
  return { rootPath: canonicalRoot, identity, repositoryFingerprint };
}

export async function refreshRepositoryContext(rootPath, initial, options = {}) {
  const current = await resolveRepositoryContext(rootPath, options);
  if (
    current.identity.gitDir !== initial.identity.gitDir
    || current.identity.commonDir !== initial.identity.commonDir
    || current.repositoryFingerprint !== initial.repositoryFingerprint
  ) {
    throw createPublishError("IDENTITY_MISMATCH", "Git repository identity changed during publish.", false);
  }
  return current;
}

export function createInitialRecord(base, context, session, now, randomUUID) {
  const operationId = randomUUID().toLowerCase();
  if (!UUID_V4_PATTERN.test(operationId)) {
    throw createPublishError("JOURNAL_IO_FAILED", "Unable to allocate a publish operation id.", false);
  }
  const timestamp = new Date(now()).toISOString();
  return {
    version: 1,
    kind: "puppyone-cloud-publish",
    operation_id: operationId,
    revision: 0,
    phase: "prepared",
    api_base_url: base.apiBaseUrl,
    api_origin: new URL(base.apiBaseUrl).origin,
    user_id: session.user_id,
    organization_id: base.organizationId,
    project_name: base.projectName,
    create_payload: {
      org_id: base.organizationId,
      name: base.projectName,
      description: null,
    },
    repository_fingerprint: context.repositoryFingerprint,
    expected_head_commit_id: base.expectedHeadCommitId,
    expected_branch: base.expectedBranch,
    destination_branch: CLOUD_DESTINATION_BRANCH,
    project_id: null,
    credential_id: null,
    secret_ref: null,
    secret_stored: false,
    canonical_remote_url: null,
    credential_username: null,
    credential_config_snapshot: null,
    remote_add_intent: false,
    remote_created_by_operation: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function assertFreshPublishStatus(status, base) {
  if (!status?.isRepo) throw createPublishError("REPOSITORY_REQUIRED", "Current workspace is not a Git repository.", false);
  if (!status.headCommitId) throw createPublishError("COMMIT_REQUIRED", "Create a Git commit before publishing.", false);
  if (!status.branch || ["head", "detached"].includes(status.branch.toLowerCase())) {
    throw createPublishError("BRANCH_REQUIRED", "Check out a local Git branch before publishing.", false);
  }
  if (
    status.headCommitId.toLowerCase() !== base.expectedHeadCommitId
    || status.branch !== base.expectedBranch
  ) {
    throw createPublishError("IDENTITY_MISMATCH", "The local branch or HEAD changed before publishing.", false);
  }
}

export function assertExpectedStatus(status, record) {
  if (!statusMatchesRecord(status, record)) {
    throw createPublishError(
      "IDENTITY_MISMATCH",
      "The local branch or HEAD no longer matches the pending Cloud publish operation.",
      false,
    );
  }
}

export function statusMatchesRecord(status, record) {
  return Boolean(
    status?.isRepo
    && status.headCommitId?.toLowerCase() === record.expected_head_commit_id
    && status.branch === record.expected_branch,
  );
}

export function statusMatchesRequest(base, record) {
  return base.expectedHeadCommitId === record.expected_head_commit_id
    && base.expectedBranch === record.expected_branch;
}

export function assertJournalStartIdentity(record, base, context, session) {
  assertJournalReadIdentity(record, base, context);
  if (
    record.user_id !== session.user_id
    || record.organization_id !== base.organizationId
    || record.project_name !== base.projectName
    || record.expected_head_commit_id !== base.expectedHeadCommitId
    || record.expected_branch !== base.expectedBranch
  ) {
    throw createPublishError("IDENTITY_MISMATCH", "Publish request does not match the pending operation.", false);
  }
}

export function assertJournalReadIdentity(record, base, context) {
  if (
    record.api_base_url !== base.apiBaseUrl
    || record.user_id !== base.userId
    || record.repository_fingerprint !== context.repositoryFingerprint
  ) {
    throw createPublishError("IDENTITY_MISMATCH", "Publish operation identity does not match this session or repository.", false);
  }
}

export function requestFingerprint(request) {
  return JSON.stringify([
    request.apiBaseUrl,
    request.userId,
    request.organizationId,
    request.projectName,
    request.expectedHeadCommitId,
    request.expectedBranch,
  ]);
}

export function toPublicState(record, { identityMatches }) {
  const resumablePhase = !["compensation-pending", "completed"].includes(record.phase);
  return {
    operationId: record.operation_id,
    phase: record.phase,
    projectId: record.project_id,
    projectName: record.project_name,
    organizationId: record.organization_id,
    expectedHeadCommitId: record.expected_head_commit_id,
    expectedBranch: record.expected_branch,
    destinationBranch: CLOUD_DESTINATION_BRANCH,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    canResume: resumablePhase && identityMatches,
    canAbandon: !["pushed", "completed"].includes(record.phase),
  };
}

export function successResult(state, gitStatus = undefined) {
  return {
    ok: true,
    state,
    ...(gitStatus === undefined ? {} : { gitStatus }),
  };
}

export function failureResult(error, state) {
  const normalized = normalizePublishError(error);
  return {
    ok: false,
    state,
    error: {
      code: normalized.code,
      retryable: normalized.retryable,
      ...(normalized.message ? { message: normalized.message } : {}),
    },
  };
}

export function createPublishError(code, message, retryable, cause = undefined) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.publishCode = CLOUD_PUBLISH_ERROR_CODES.includes(code) ? code : "UNKNOWN";
  error.publishRetryable = retryable === true;
  return error;
}

export function mapCloudMutationError(defaultCode, message, error) {
  if (["SESSION_SIGNED_OUT", "SESSION_SIGNING_OUT", "SESSION_CHANGED"].includes(error?.code)) {
    return createPublishError("SESSION_REQUIRED", "Sign in to PuppyOne Cloud and resume publishing.", true, error);
  }
  if (Number(error?.status) === 401) {
    return createPublishError("SESSION_REQUIRED", "Sign in to PuppyOne Cloud and resume publishing.", true, error);
  }
  if (Number(error?.status) === 403) {
    return createPublishError("PERMISSION_DENIED", "You do not have permission to publish this Project.", false, error);
  }
  if (error?.code === "organization_required") {
    return createPublishError("ORGANIZATION_REQUIRED", "Select a PuppyOne organization before publishing.", false, error);
  }
  const retryable = ![400, 403, 404, 409, 410, 422].includes(Number(error?.status));
  return createPublishError(defaultCode, message, retryable, error);
}

export function isSimulatedCrash(error) {
  return error?.simulateCrash === true;
}

function requireApiBase(value) {
  const normalized = normalizeCloudApiBaseUrl(value);
  if (!normalized) throw createPublishError("SESSION_REQUIRED", "Cloud API origin is invalid.", false);
  return normalized;
}

function requireString(value, code, message) {
  if (typeof value !== "string" || !value.trim()) throw createPublishError(code, message, false);
  return value.trim();
}

function requireCommitId(value) {
  const normalized = requireString(value, "COMMIT_REQUIRED", "A committed Git HEAD is required.").toLowerCase();
  if (!COMMIT_ID_PATTERN.test(normalized)) {
    throw createPublishError("COMMIT_REQUIRED", "A valid committed Git HEAD is required.", false);
  }
  return normalized;
}

function normalizePublishError(error) {
  const code = CLOUD_PUBLISH_ERROR_CODES.includes(error?.publishCode)
    ? error.publishCode
    : error?.code === "CLOUD_PUBLISH_SECRET_VAULT_FAILED"
      ? "JOURNAL_IO_FAILED"
      : "UNKNOWN";
  const retryable = typeof error?.publishRetryable === "boolean"
    ? error.publishRetryable
    : code === "UNKNOWN";
  return {
    code,
    retryable,
    message: sanitizeDiagnostic(error instanceof Error ? error.message : String(error ?? "")),
  };
}

function sanitizeDiagnostic(message) {
  return String(message || "")
    .replace(/pwg_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@")
    .slice(0, 500);
}
