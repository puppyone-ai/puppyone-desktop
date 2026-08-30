const MAX_REFERENCE_SNAPSHOT_URL_LENGTH = Math.ceil(512 * 1024 * 4 / 3) + 256;

export function readinessWithAccountState(readiness, accountState, runtimeName = "Agent runtime") {
  if (readiness.status === "ready" && requiresRuntimeSetup(accountState)) {
    const code = accountState?.setupReason === "authentication-expired"
      ? "AUTHENTICATION_EXPIRED"
      : accountState?.requiresOpenaiAuth || accountState?.setupReason === "authentication-required"
        ? "AUTHENTICATION_REQUIRED"
        : "RUNTIME_SETUP_REQUIRED";
    return {
      ...readiness,
      status: "installed-not-authenticated",
      code,
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

export function normalizePrompt(value, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) throw new Error("Enter a message for the Agent.");
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
  if (value.length > 32) throw new Error("Agent references exceed the 32-file safety limit.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || entry.authorized !== true) {
      throw new Error("Agent references must be authorized by the main process.");
    }
    if (entry.kind !== "workspace-entry" && entry.kind !== "staged-attachment") {
      throw new Error("Agent reference kind is not supported.");
    }
    if (typeof entry.path !== "string" || entry.path.length === 0 || entry.path.length > 4_096) {
      throw new Error("Agent reference path is invalid.");
    }
    const kind = entry.kind;
    const entryType = entry.entryType === "directory" ? "directory" : "file";
    return {
      id: normalizeReferenceId(entry.id, entry.path),
      kind,
      ...(kind === "workspace-entry" ? { entryType } : {}),
      path: entry.path,
      name: normalizeOptionalString(entry.name ?? entry.displayName),
      displayName: normalizeOptionalString(entry.displayName ?? entry.name) || "reference",
      ...(kind === "workspace-entry" && typeof entry.relativePath === "string"
        ? { relativePath: entry.relativePath.slice(0, 4_096) }
        : {}),
      mime: normalizeOptionalString(entry.mime),
      size: Number.isSafeInteger(entry.size) && entry.size >= 0 ? entry.size : 0,
      ...(isBoundedDataUrl(entry.snapshotUrl) ? { snapshotUrl: entry.snapshotUrl } : {}),
    };
  });
}

export function requireSupportedAgentReferences(capabilities, references) {
  const input = capabilities?.referenceInputs ?? {};
  const values = Array.isArray(references) ? references : [];
  const totalBytes = values.reduce((sum, entry) => sum + (Number.isSafeInteger(entry?.size) ? entry.size : 0), 0);
  if (values.length > (input.maxReferences ?? 0)) throw new Error("This Agent accepts fewer reference inputs.");
  if (totalBytes > (input.maxTotalReferenceBytes ?? 0)) throw new Error("Reference inputs exceed this Agent's total size limit.");
  for (const reference of values) {
    if ((reference.size ?? 0) > (input.maxReferenceBytes ?? 0)) {
      throw new Error("A reference exceeds this Agent's per-file size limit.");
    }
    if (reference.kind === "workspace-entry") {
      if (reference.entryType === "directory" && input.workspaceDirectories !== true) {
        throw new Error("The selected Agent does not accept workspace directories.");
      }
      if (reference.entryType !== "directory" && input.workspaceFiles !== true) {
        throw new Error("The selected Agent does not accept workspace files.");
      }
      continue;
    }
    const isImage = typeof reference.mime === "string" && reference.mime.startsWith("image/");
    const transport = isImage ? input.images : input.genericFiles;
    if (!transport || transport === "none") {
      throw new Error(isImage
        ? "The selected Agent does not accept image attachments."
        : "The selected Agent does not accept this file attachment type.");
    }
    if (Array.isArray(input.acceptedMimeTypes) && input.acceptedMimeTypes.length > 0
      && !input.acceptedMimeTypes.includes(reference.mime)) {
      throw new Error("The selected Agent does not accept this attachment MIME type.");
    }
  }
}

export function normalizeReferenceDisplays(references) {
  return (Array.isArray(references) ? references : []).slice(0, 32).map((reference) => ({
    id: normalizeReferenceId(reference.id, `${reference.kind}:${reference.path}`),
    kind: reference.kind === "staged-attachment"
      ? "attachment"
      : reference.entryType === "directory" ? "workspace-directory" : "workspace-file",
    displayName: normalizeOptionalString(reference.displayName ?? reference.name) || "reference",
    ...(reference.kind === "workspace-entry" && typeof reference.relativePath === "string"
      ? { relativePath: reference.relativePath.slice(0, 4_096) }
      : {}),
    ...(reference.kind === "staged-attachment" && reference.mime ? { mime: reference.mime } : {}),
    ...(reference.kind === "staged-attachment" && Number.isSafeInteger(reference.size) ? { size: reference.size } : {}),
  }));
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
    code: "RUNTIME_DISCOVERY_FAILED",
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

function normalizeReferenceId(value, fallback) {
  if (typeof value === "string" && /^[A-Za-z0-9:._-]{1,256}$/.test(value)) return value;
  let hash = 2166136261;
  for (const character of String(fallback ?? "reference")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `reference-${(hash >>> 0).toString(16)}`;
}
