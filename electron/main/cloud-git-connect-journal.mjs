import { createWorktreeGitOperationJournal } from "./cloud-publish-journal.mjs";
import { normalizeCredentialConfigSnapshot } from "./cloud-publish-git-credentials.mjs";

const VERSION = 1;
const KIND = "configure-existing-remote";
const PHASES = ["prepared", "credential-issued", "remote-configured", "compensation-pending", "completed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createCloudGitConnectJournal(options = {}) {
  return createWorktreeGitOperationJournal({
    ...options,
    filename: "pending-cloud-git-connect.v1.json",
    normalizeEntry: normalizeConnectRecord,
    prepareEntry: (record) => ({ ...record, version: VERSION, kind: KIND }),
    canTransition: (from, to) => ({
      prepared: ["prepared", "credential-issued", "compensation-pending"],
      "credential-issued": ["credential-issued", "remote-configured", "compensation-pending"],
      "remote-configured": ["remote-configured", "completed", "compensation-pending"],
      "compensation-pending": ["compensation-pending", "completed"],
      completed: ["completed"],
    })[from]?.includes(to) === true,
  });
}

function normalizeConnectRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("record");
  if (value.version !== VERSION || value.kind !== KIND) fail("version");
  const operationId = uuid(value.operation_id, "operation_id");
  const phase = string(value.phase, "phase");
  if (!PHASES.includes(phase)) fail("phase");
  const revision = value.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) fail("revision");
  return {
    version: VERSION,
    kind: KIND,
    operation_id: operationId,
    revision,
    phase,
    api_base_url: string(value.api_base_url, "api_base_url"),
    api_origin: string(value.api_origin, "api_origin"),
    user_id: string(value.user_id, "user_id"),
    project_id: string(value.project_id, "project_id"),
    repository_fingerprint: string(value.repository_fingerprint, "repository_fingerprint"),
    secret_ref: optionalUuid(value.secret_ref, "secret_ref"),
    secret_stored: value.secret_stored === true,
    credential_id: optionalString(value.credential_id, "credential_id"),
    canonical_remote_url: optionalString(value.canonical_remote_url, "canonical_remote_url"),
    credential_username: optionalString(value.credential_username, "credential_username"),
    credential_config_snapshot: value.credential_config_snapshot == null
      ? null
      : normalizeCredentialConfigSnapshot(value.credential_config_snapshot),
    remote_add_intent: value.remote_add_intent === true,
    remote_created_by_operation: value.remote_created_by_operation === true,
    created_at: iso(value.created_at, "created_at"),
    updated_at: iso(value.updated_at, "updated_at"),
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
  const normalized = string(value, field).toLowerCase();
  if (!UUID.test(normalized)) fail(field);
  return normalized;
}

function optionalUuid(value, field) {
  return value == null ? null : uuid(value, field);
}

function iso(value, field) {
  const parsed = new Date(string(value, field));
  if (Number.isNaN(parsed.getTime())) fail(field);
  return parsed.toISOString();
}

function fail(field) {
  const error = new Error(`Cloud Git connect journal field '${field}' is invalid.`);
  error.publishCode = "JOURNAL_CORRUPT";
  throw error;
}
