const AGENT_EVENT_TYPES = new Set([
  "session.started",
  "session.resumed",
  "session.closed",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "turn.interrupted",
  "assistant.delta",
  "assistant.completed",
  "reasoning.summary.delta",
  "plan.updated",
  "tool.started",
  "tool.progress",
  "tool.completed",
  "command.output.delta",
  "file.change.updated",
  "usage.updated",
  "approval.requested",
  "approval.resolved",
  "provider.warning",
  "provider.error",
]);

const SECRET_PATTERNS = [
  { pattern: /\bsk-[A-Za-z0-9_-]{12,}\b/g, replacement: "[redacted]" },
  { pattern: /\b(Bearer\s+)[A-Za-z0-9._~+\/-]{12,}/gi, replacement: "$1[redacted]" },
  {
    pattern: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|id[_-]?token|token|authorization|password|client[_-]?secret|secret[_-]?access[_-]?key|private[_-]?key)(\s*[:=]\s*)[^\s,;]+/gi,
    replacement: "$1$2[redacted]",
  },
  {
    pattern: /\b([A-Z][A-Z0-9_]*(?:_API_KEY|_ACCESS_TOKEN|_REFRESH_TOKEN|_AUTH_TOKEN|_ID_TOKEN|_SESSION_TOKEN|_CLIENT_SECRET|_SECRET_ACCESS_KEY|_PRIVATE_KEY|_PASSWORD|_CREDENTIALS?))(\s*=\s*)[^\s,;]+/g,
    replacement: "$1$2[redacted]",
  },
  { pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/g, replacement: "[redacted]" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replacement: "[redacted]" },
];

const SECRET_OBJECT_KEYS = new Set([
  "token",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "idtoken",
  "sessiontoken",
  "authorization",
  "password",
  "clientsecret",
  "secretaccesskey",
  "privatekey",
  "secret",
  "credential",
  "credentials",
  "cookie",
  "setcookie",
]);

export function isAgentEventEnvelope(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value.schemaVersion === 1
    && Number.isSafeInteger(value.sequence)
    && value.sequence > 0
    && typeof value.sessionId === "string"
    && value.sessionId.length > 0
    && value.provider === "codex"
    && (value.providerSessionId === null || typeof value.providerSessionId === "string")
    && (value.turnId === null || typeof value.turnId === "string")
    && (value.itemId === null || typeof value.itemId === "string")
    && typeof value.emittedAt === "string"
    && AGENT_EVENT_TYPES.has(value.type),
  );
}

export function createAgentEventEnvelope({
  sequence,
  sessionId,
  providerSessionId = null,
  turnId = null,
  itemId = null,
  type,
  payload = {},
  emittedAt = new Date().toISOString(),
}) {
  const event = {
    schemaVersion: 1,
    sequence,
    sessionId,
    provider: "codex",
    providerSessionId,
    turnId,
    itemId,
    emittedAt,
    type,
    payload: boundRendererValue(redactSecrets(payload)),
  };
  if (!isAgentEventEnvelope(event)) {
    throw new TypeError(`Invalid normalized AgentEvent: ${String(type)}`);
  }
  return event;
}

export function redactSecrets(value, depth = 0) {
  if (depth > 12) return "[truncated]";
  if (typeof value === "string") return redactSecretText(value);
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, depth + 1));
  if (!value || typeof value !== "object") return value;

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSecretObjectKey(key)) {
      next[key] = "[redacted]";
    } else {
      next[key] = redactSecrets(entry, depth + 1);
    }
  }
  return next;
}

function isSecretObjectKey(key) {
  const normalized = String(key).replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return SECRET_OBJECT_KEYS.has(normalized);
}

export function redactSecretText(value) {
  let output = String(value);
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function boundRendererValue(value, maxStringLength = 32 * 1024, depth = 0) {
  if (depth > 12) return "[truncated]";
  if (typeof value === "string") {
    if (value.length <= maxStringLength) return value;
    return `${value.slice(0, maxStringLength)}\n… output truncated`;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((entry) => boundRendererValue(entry, maxStringLength, depth + 1));
  }
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, entry] of Object.entries(value).slice(0, 200)) {
    next[key] = boundRendererValue(entry, maxStringLength, depth + 1);
  }
  return next;
}

export function countTextBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

export const agentEventTypes = Object.freeze(Array.from(AGENT_EVENT_TYPES));
