const MAX_REFERENCE_SNAPSHOT_URL_LENGTH = Math.ceil(25 * 1024 * 1024 * 4 / 3) + 256;

export function readinessWithAccountState(readiness, accountState, runtimeName = "Agent runtime") {
  if (readiness.status === "ready" && requiresRuntimeSetup(accountState)) {
    return {
      ...readiness,
      status: "installed-not-authenticated",
      selectable: false,
      message: accountState?.error || (
        readiness.message && readiness.message !== `${runtimeName} is ready.`
          ? readiness.message
          : `${runtimeName} requires authentication or model setup.`
      ),
    };
  }
  return readiness;
}

export function assertReady(readiness, runtimeName = "Agent runtime") {
  if (readiness?.status !== "ready") {
    throw new Error(readiness?.message || `${runtimeName} is not ready.`);
  }
}

export function assertAuthenticated(accountState, runtimeName = "Agent runtime") {
  if (requiresRuntimeSetup(accountState)) {
    throw new Error(accountState?.error || `${runtimeName} requires authentication or model setup.`);
  }
}

export function requiresRuntimeSetup(accountState) {
  return Boolean(
    !accountState?.account
    && (accountState?.requiresOpenaiAuth || accountState?.requiresRuntimeSetup),
  );
}

export function requireWorkspaceRoot(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("No authorized local workspace is assigned to this Agent session.");
  }
}

export function requireMatchingWorkspace(session, workspaceRoot) {
  // Trusted IPC always supplies a canonical root. Direct service-level tests
  // may omit it, but a supplied proof must match exactly.
  if (workspaceRoot === null || workspaceRoot === undefined) return;
  requireWorkspaceRoot(workspaceRoot);
  if (session.workspaceRoot !== workspaceRoot) {
    throw new Error("Agent session does not belong to the assigned workspace.");
  }
}

export function requireSenderId(sender) {
  if (!Number.isSafeInteger(sender?.id) || sender.id <= 0) throw new Error("Agent IPC sender is invalid.");
  return sender.id;
}

export function normalizePrompt(value) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Enter a message for the Agent.");
  if (value.length > 128 * 1024) throw new Error("The Agent message is too large.");
  return value;
}

export function normalizeRequiredId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:._-]{1,256}$/.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

export function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 200) : null;
}

export function normalizeRuntimeId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{1,39}$/.test(value) ? value : null;
}

export function normalizeOptionalId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:._-]{1,256}$/.test(value) ? value : null;
}

export function normalizeAuthorizedReferences(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 32).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || entry.authorized !== true) return [];
    if (typeof entry.path !== "string" || entry.path.length === 0 || entry.path.length > 4_096) return [];
    return [{
      path: entry.path,
      name: normalizeOptionalString(entry.name),
      mime: normalizeOptionalString(entry.mime),
      ...(isBoundedDataUrl(entry.snapshotUrl) ? { snapshotUrl: entry.snapshotUrl } : {}),
    }];
  });
}

export function normalizeQuestionAnswers(value, questions) {
  if (value === null || value === undefined) return null;
  let rows;
  if (typeof value === "string") rows = [[value]];
  else if (Array.isArray(value) && value.every(Array.isArray)) rows = value;
  else if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    rows = Array.isArray(questions) && questions.length > 1
      ? value.map((entry) => [entry])
      : [value];
  } else {
    throw new Error("Question answers are invalid.");
  }
  return rows.slice(0, 8).map((row) => row
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 4_000))
    .filter(Boolean)
    .slice(0, 20));
}

export function unavailableReadiness(message) {
  return {
    runtimeId: "unknown",
    provider: "unknown",
    status: "error",
    version: null,
    minimumVersion: null,
    message,
    source: "missing",
    compatibility: "unavailable",
    selectable: false,
  };
}

export function normalizeApprovalDecision(value) {
  if (!["accept", "acceptForSession", "decline", "cancel"].includes(value)) {
    throw new Error("Approval decision is invalid.");
  }
  return value;
}

export function normalizeSequence(value) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
}

function isBoundedDataUrl(value) {
  if (typeof value !== "string" || value.length > MAX_REFERENCE_SNAPSHOT_URL_LENGTH) return false;
  const marker = value.indexOf(";base64,");
  return value.startsWith("data:") && marker > 5 && marker < 200 && !value.slice(0, marker).includes("\n");
}
