export function migrateVersion1Journal(value) {
  const phase = requireLegacyPhase(value?.phase);
  const projectId = optionalString(value.project_id);
  const timestamp = requireIso(value.updated_at);
  const accepted = ["pushed", "completed"].includes(phase);
  const cleaning = phase === "compensation-pending";
  const attempt = {
    attempt_id: requireUuid(value.operation_id),
    sequence: 1,
    commit_oid: requireCommit(value.expected_head_commit_id),
    expected_remote_oid: null,
    state: accepted ? "accepted" : cleaning ? "failed" : "preparing",
    started_at: requireIso(value.created_at),
    updated_at: timestamp,
    completed_at: accepted ? timestamp : null,
  };
  return {
    version: 2,
    kind: "puppyone-cloud-initialization",
    operation_id: requireUuid(value.operation_id),
    revision: requireRevision(value.revision),
    checkpoint: checkpointForLegacyPhase(phase),
    api_base_url: requireString(value.api_base_url),
    api_origin: requireString(value.api_origin),
    user_id: requireString(value.user_id),
    organization_id: requireString(value.organization_id),
    project_name: requireString(value.project_name),
    create_payload: value.create_payload,
    repository_fingerprint: requireString(value.repository_fingerprint),
    selected_source_branch: requireString(value.expected_branch),
    selected_source_ref: `refs/heads/${requireString(value.expected_branch)}`,
    destination_ref: "refs/heads/main",
    project_state: accepted ? "published" : cleaning ? "deleting" : projectId ? "empty" : "absent",
    push_state: accepted ? "accepted" : cleaning ? "failed" : "idle",
    cleanup_state: cleaning ? "requested" : "none",
    project_id: projectId,
    credential_id: optionalString(value.credential_id),
    secret_ref: optionalString(value.secret_ref),
    secret_stored: value.secret_stored === true,
    canonical_remote_url: optionalString(value.canonical_remote_url),
    credential_username: optionalString(value.credential_username),
    credential_config_snapshot: value.credential_config_snapshot ?? null,
    remote_add_intent: value.remote_add_intent === true,
    remote_created_by_operation: value.remote_created_by_operation === true,
    attempt_count: 1,
    attempt,
    attempt_history: [],
    last_error: null,
    migrated_from: {
      version: 1,
      phase,
      migrated_at: timestamp,
      persisted: false,
    },
    created_at: requireIso(value.created_at),
    updated_at: timestamp,
  };
}

function checkpointForLegacyPhase(phase) {
  return ({
    prepared: "prepared",
    "project-created": "project-created",
    "credential-issued": "credential-issued",
    "remote-configured": "remote-configured",
    pushed: "push-accepted",
    "compensation-pending": "cleanup-requested",
    completed: "completed",
  })[phase];
}

function requireLegacyPhase(value) {
  const phase = requireString(value);
  if (![
    "prepared",
    "project-created",
    "credential-issued",
    "remote-configured",
    "pushed",
    "compensation-pending",
    "completed",
  ].includes(phase)) throw new Error("Cloud initialization journal legacy phase is invalid.");
  return phase;
}

function requireString(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Cloud initialization journal field is invalid.");
  return value.trim();
}

function optionalString(value) {
  return value == null ? null : requireString(value);
}

function requireUuid(value) {
  const result = requireString(value).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    throw new Error("Cloud initialization journal UUID is invalid.");
  }
  return result;
}

function requireCommit(value) {
  const result = requireString(value).toLowerCase();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(result)) {
    throw new Error("Cloud initialization journal commit is invalid.");
  }
  return result;
}

function requireRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Cloud initialization journal revision is invalid.");
  return value;
}

function requireIso(value) {
  const parsed = new Date(requireString(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("Cloud initialization journal timestamp is invalid.");
  return parsed.toISOString();
}
