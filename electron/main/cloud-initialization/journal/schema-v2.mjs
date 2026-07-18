import { normalizeCredentialConfigSnapshot } from "../../cloud-publish-git-credentials.mjs";
import { CLOUD_PUBLISH_ERROR_CODES } from "../contract.mjs";
import { migrateVersion1Journal } from "./migrate-v1.mjs";

export const CLOUD_INITIALIZATION_CHECKPOINTS = Object.freeze([
  "prepared",
  "project-created",
  "credential-issued",
  "remote-configured",
  "push-attempt",
  "push-accepted",
  "cleanup-requested",
  "cleanup-server-complete",
  "completed",
]);

const PROJECT_STATES = ["absent", "creating", "empty", "published", "deleting", "deleted", "unavailable"];
const PUSH_STATES = ["idle", "preparing", "uploading", "confirming", "accepted", "failed", "uncertain", "conflict"];
const CLEANUP_STATES = ["none", "requested", "deleting", "failed", "completed"];
const ATTEMPT_STATES = ["preparing", "uploading", "confirming", "accepted", "failed", "uncertain", "conflict"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export function normalizeCloudInitializationJournalRecord(raw) {
  try {
    const value = raw?.version === 1 && raw?.kind === "puppyone-cloud-publish"
      ? migrateVersion1Journal(raw)
      : raw;
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("record");
    if (value.version !== 2 || value.kind !== "puppyone-cloud-initialization") fail("version");
    const operationId = uuid(value.operation_id, "operation_id");
    const organizationId = string(value.organization_id, "organization_id");
    const projectName = string(value.project_name, "project_name");
    const sourceBranch = string(value.selected_source_branch, "selected_source_branch");
    const sourceRef = string(value.selected_source_ref, "selected_source_ref");
    if (sourceRef !== `refs/heads/${sourceBranch}` || value.destination_ref !== "refs/heads/main") fail("refs");
    const createPayload = normalizeCreatePayload(value.create_payload, organizationId, projectName);
    return {
      version: 2,
      kind: "puppyone-cloud-initialization",
      operation_id: operationId,
      revision: revision(value.revision),
      checkpoint: enumeration(value.checkpoint, CLOUD_INITIALIZATION_CHECKPOINTS, "checkpoint"),
      api_base_url: string(value.api_base_url, "api_base_url"),
      api_origin: string(value.api_origin, "api_origin"),
      user_id: string(value.user_id, "user_id"),
      organization_id: organizationId,
      project_name: projectName,
      create_payload: createPayload,
      repository_fingerprint: string(value.repository_fingerprint, "repository_fingerprint"),
      selected_source_branch: sourceBranch,
      selected_source_ref: sourceRef,
      destination_ref: "refs/heads/main",
      project_state: enumeration(value.project_state, PROJECT_STATES, "project_state"),
      push_state: enumeration(value.push_state, PUSH_STATES, "push_state"),
      cleanup_state: enumeration(value.cleanup_state, CLEANUP_STATES, "cleanup_state"),
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
      attempt_count: positiveInteger(value.attempt_count, "attempt_count"),
      attempt: normalizeAttempt(value.attempt, false),
      attempt_history: normalizeAttemptHistory(value.attempt_history),
      last_error: normalizeLastError(value.last_error),
      migrated_from: normalizeMigration(value.migrated_from),
      created_at: iso(value.created_at, "created_at"),
      updated_at: iso(value.updated_at, "updated_at"),
    };
  } catch (error) {
    if (error?.publishCode === "JOURNAL_CORRUPT") throw error;
    const wrapped = new Error("Cloud initialization journal is invalid.", { cause: error });
    wrapped.publishCode = "JOURNAL_CORRUPT";
    wrapped.publishRetryable = false;
    throw wrapped;
  }
}

function normalizeCreatePayload(value, organizationId, projectName) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || value.org_id !== organizationId
    || value.name !== projectName
    || value.description !== null
    || Object.keys(value).sort().join(",") !== "description,name,org_id"
  ) fail("create_payload");
  return { org_id: organizationId, name: projectName, description: null };
}

function normalizeAttempt(value, history) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("attempt");
  const state = enumeration(value.state, ATTEMPT_STATES, "attempt.state");
  if (history && !["accepted", "failed", "uncertain", "conflict"].includes(state)) fail("attempt_history.state");
  return {
    attempt_id: uuid(value.attempt_id, "attempt.attempt_id"),
    sequence: positiveInteger(value.sequence, "attempt.sequence"),
    commit_oid: commit(value.commit_oid, "attempt.commit_oid"),
    expected_remote_oid: value.expected_remote_oid == null
      ? null
      : commit(value.expected_remote_oid, "attempt.expected_remote_oid"),
    state,
    started_at: iso(value.started_at, "attempt.started_at"),
    updated_at: iso(value.updated_at, "attempt.updated_at"),
    completed_at: value.completed_at == null ? null : iso(value.completed_at, "attempt.completed_at"),
  };
}

function normalizeAttemptHistory(value) {
  if (!Array.isArray(value) || value.length > 20) fail("attempt_history");
  return value.map((attempt) => normalizeAttempt(attempt, true));
}

function normalizeLastError(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("last_error");
  return {
    code: enumeration(value.code, CLOUD_PUBLISH_ERROR_CODES, "last_error.code"),
    retryable: value.retryable === true,
    occurred_at: iso(value.occurred_at, "last_error.occurred_at"),
  };
}

function normalizeMigration(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) fail("migrated_from");
  return {
    version: 1,
    phase: string(value.phase, "migrated_from.phase"),
    migrated_at: iso(value.migrated_at, "migrated_from.migrated_at"),
    persisted: value.persisted === true,
  };
}

function string(value, field) {
  if (typeof value !== "string" || !value.trim()) fail(field);
  return value.trim();
}

function optionalString(value, field) {
  return value == null ? null : string(value, field);
}

function uuid(value, field) {
  const result = string(value, field).toLowerCase();
  if (!UUID.test(result)) fail(field);
  return result;
}

function optionalUuid(value, field) {
  return value == null ? null : uuid(value, field);
}

function commit(value, field) {
  const result = string(value, field).toLowerCase();
  if (!COMMIT.test(result)) fail(field);
  return result;
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("revision");
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail(field);
  return value;
}

function iso(value, field) {
  const parsed = new Date(string(value, field));
  if (Number.isNaN(parsed.getTime())) fail(field);
  return parsed.toISOString();
}

function enumeration(value, allowed, field) {
  if (!allowed.includes(value)) fail(field);
  return value;
}

function fail(field) {
  const error = new Error(`Cloud initialization journal field '${field}' is invalid.`);
  error.publishCode = "JOURNAL_CORRUPT";
  error.publishRetryable = false;
  throw error;
}
