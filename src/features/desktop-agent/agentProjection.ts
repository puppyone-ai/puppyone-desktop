import type { AgentEvent, AgentTurnTerminalState } from "./agentTypes";

export type AgentTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  turnId: string | null;
  itemId: string | null;
  text: string;
  streaming: boolean;
  terminalState: AgentTurnTerminalState | null;
  sequence: number;
};

export type AgentActivity = {
  id: string;
  turnId: string | null;
  itemId: string | null;
  kind: "tool" | "command" | "file-change" | "plan" | "reasoning" | "warning" | "error";
  label: string;
  status: string;
  detail: Record<string, unknown>;
  output: string;
  sequence: number;
};

export type AgentApproval = {
  requestId: string;
  turnId: string;
  itemId: string | null;
  kind: "command" | "file-change";
  title: string;
  command: string | null;
  cwd: string | null;
  commandActions: Array<Record<string, unknown>>;
  networkApprovalContext: { host: string; protocol: string } | null;
  grantRoot: string | null;
  policyChangeRequested: boolean;
  reason: string | null;
  availableDecisions: Array<"accept" | "acceptForSession" | "decline" | "cancel">;
  sequence: number;
};

export type AgentProjection = {
  sessionState: "empty" | "active" | "closed";
  lastSequence: number;
  partialHistory: boolean;
  missingRanges: Array<{ from: number; to: number }>;
  messages: AgentTranscriptMessage[];
  activities: AgentActivity[];
  approvals: AgentApproval[];
  runningTurnId: string | null;
  terminalState: AgentTurnTerminalState | null;
  usage: Record<string, unknown> | null;
};

const MAX_COMMAND_OUTPUT = 64 * 1024;

export function createAgentProjection(options: { partialHistory?: boolean } = {}): AgentProjection {
  return {
    sessionState: "empty",
    lastSequence: 0,
    partialHistory: Boolean(options.partialHistory),
    missingRanges: [],
    messages: [],
    activities: [],
    approvals: [],
    runningTurnId: null,
    terminalState: null,
    usage: null,
  };
}

export function applyAgentEvents(
  initial: AgentProjection,
  events: AgentEvent[],
  options: { partialHistory?: boolean } = {},
): AgentProjection {
  return events.reduce(applyAgentEvent, options.partialHistory
    ? { ...initial, partialHistory: true }
    : initial);
}

export function applyAgentEvent(previous: AgentProjection, event: AgentEvent): AgentProjection {
  if (event.sequence <= previous.lastSequence) return previous;
  let next = cloneProjection(previous);
  if (previous.lastSequence > 0 && event.sequence > previous.lastSequence + 1) {
    next.partialHistory = true;
    next.missingRanges.push({ from: previous.lastSequence + 1, to: event.sequence - 1 });
  } else if (previous.lastSequence === 0 && event.sequence > 1) {
    next.partialHistory = true;
    next.missingRanges.push({ from: 1, to: event.sequence - 1 });
  }
  next.lastSequence = event.sequence;
  const payload = event.payload ?? {};

  switch (event.type) {
    case "session.started":
    case "session.resumed":
      next.sessionState = "active";
      return next;
    case "session.closed":
      next.sessionState = "closed";
      next.runningTurnId = null;
      return next;
    case "turn.started": {
      next.sessionState = "active";
      next.runningTurnId = event.turnId;
      next.terminalState = null;
      const prompt = readString(payload.prompt);
      if (prompt && !next.messages.some((message) => message.role === "user" && message.turnId === event.turnId)) {
        next.messages.push({
          id: `user:${event.turnId ?? event.sequence}`,
          role: "user",
          turnId: event.turnId,
          itemId: null,
          text: prompt,
          streaming: false,
          terminalState: null,
          sequence: event.sequence,
        });
      }
      return next;
    }
    case "turn.completed":
    case "turn.failed":
    case "turn.interrupted": {
      const terminalState = event.type.slice("turn.".length) as AgentTurnTerminalState;
      next.runningTurnId = null;
      next.terminalState = terminalState;
      next.messages = next.messages.map((message) => (
        message.role === "assistant" && message.turnId === event.turnId
          ? { ...message, streaming: false, terminalState }
          : message
      ));
      return next;
    }
    case "assistant.delta":
      return upsertAssistant(next, event, readString(payload.delta), true, false);
    case "assistant.completed":
      return upsertAssistant(next, event, readString(payload.text), false, true);
    case "reasoning.summary.delta":
      return upsertActivity(next, event, {
        kind: "reasoning",
        label: "Reasoning summary",
        status: payload.completed ? "completed" : "running",
        detail: payload,
      }, { appendDetailField: "delta" });
    case "plan.updated":
      return upsertActivity(next, { ...event, itemId: event.itemId ?? "current-plan" }, {
        kind: "plan",
        label: "Plan updated",
        status: payload.completed ? "completed" : "running",
        detail: payload,
      });
    case "tool.started":
    case "tool.progress":
    case "tool.completed": {
      const kind = payload.kind === "command" ? "command" : payload.kind === "file-change" ? "file-change" : "tool";
      return upsertActivity(next, event, {
        kind,
        label: readString(payload.label) || defaultToolLabel(kind),
        status: readString(payload.status) || (event.type === "tool.completed" ? "completed" : "running"),
        detail: payload,
      });
    }
    case "command.output.delta": {
      const id = activityId(event);
      let activity = next.activities.find((entry) => entry.id === id);
      if (!activity) {
        activity = {
          id,
          turnId: event.turnId,
          itemId: event.itemId,
          kind: "command",
          label: "Command output",
          status: "running",
          detail: {},
          output: "",
          sequence: event.sequence,
        };
        next.activities.push(activity);
      }
      activity.output = `${activity.output}${readString(payload.delta)}`.slice(-MAX_COMMAND_OUTPUT);
      activity.sequence = event.sequence;
      return next;
    }
    case "file.change.updated":
      return upsertActivity(next, event, {
        kind: "file-change",
        label: fileChangeLabel(payload),
        status: readString(payload.status) || "running",
        detail: payload,
      });
    case "usage.updated":
      next.usage = payload;
      return next;
    case "approval.requested": {
      const requestId = readString(payload.requestId);
      if (!requestId || !event.turnId || next.approvals.some((approval) => approval.requestId === requestId)) return next;
      next.approvals.push({
        requestId,
        turnId: event.turnId,
        itemId: event.itemId,
        kind: payload.kind === "file-change" ? "file-change" : "command",
        title: readString(payload.title) || "Approval required",
        command: nullableString(payload.command),
        cwd: nullableString(payload.cwd),
        commandActions: readRecordArray(payload.commandActions),
        networkApprovalContext: readNetworkApprovalContext(payload.networkApprovalContext),
        grantRoot: nullableString(payload.grantRoot),
        policyChangeRequested: Boolean(
          payload.proposedExecpolicyAmendment
          || (Array.isArray(payload.proposedNetworkPolicyAmendments) && payload.proposedNetworkPolicyAmendments.length > 0)
        ),
        reason: nullableString(payload.reason),
        availableDecisions: readApprovalDecisions(payload.availableDecisions),
        sequence: event.sequence,
      });
      return next;
    }
    case "approval.resolved": {
      const requestId = readString(payload.requestId);
      next.approvals = next.approvals.filter((approval) => approval.requestId !== requestId);
      return next;
    }
    case "provider.warning":
    case "provider.error":
      next.activities.push({
        id: `${event.type}:${event.sequence}`,
        turnId: event.turnId,
        itemId: event.itemId,
        kind: event.type === "provider.error" ? "error" : "warning",
        label: readString(payload.message) || (event.type === "provider.error" ? "Provider error" : "Provider warning"),
        status: event.type === "provider.error" ? "failed" : "warning",
        detail: payload,
        output: "",
        sequence: event.sequence,
      });
      return next;
    default:
      return next;
  }
}

function upsertAssistant(
  projection: AgentProjection,
  event: AgentEvent,
  text: string,
  streaming: boolean,
  authoritative: boolean,
) {
  const id = `assistant:${event.itemId ?? event.turnId ?? event.sequence}`;
  const existing = projection.messages.find((message) => message.id === id);
  if (existing) {
    existing.text = authoritative ? text : `${existing.text}${text}`;
    existing.streaming = streaming;
    existing.sequence = event.sequence;
  } else {
    projection.messages.push({
      id,
      role: "assistant",
      turnId: event.turnId,
      itemId: event.itemId,
      text,
      streaming,
      terminalState: null,
      sequence: event.sequence,
    });
  }
  return projection;
}

function upsertActivity(
  projection: AgentProjection,
  event: AgentEvent,
  value: Pick<AgentActivity, "kind" | "label" | "status" | "detail">,
  options: { appendDetailField?: string } = {},
) {
  const id = activityId(event);
  const existing = projection.activities.find((entry) => entry.id === id);
  if (existing) {
    existing.label = value.label || existing.label;
    existing.status = value.status;
    if (options.appendDetailField) {
      const field = options.appendDetailField;
      existing.detail = {
        ...existing.detail,
        ...value.detail,
        [field]: `${readString(existing.detail[field])}${readString(value.detail[field])}`,
      };
    } else {
      existing.detail = { ...existing.detail, ...value.detail };
    }
    existing.sequence = event.sequence;
  } else {
    projection.activities.push({
      id,
      turnId: event.turnId,
      itemId: event.itemId,
      ...value,
      output: "",
      sequence: event.sequence,
    });
  }
  return projection;
}

function cloneProjection(value: AgentProjection): AgentProjection {
  return {
    ...value,
    missingRanges: [...value.missingRanges],
    messages: value.messages.map((message) => ({ ...message })),
    activities: value.activities.map((activity) => ({ ...activity, detail: { ...activity.detail } })),
    approvals: value.approvals.map((approval) => ({
      ...approval,
      commandActions: approval.commandActions.map((action) => ({ ...action })),
      networkApprovalContext: approval.networkApprovalContext ? { ...approval.networkApprovalContext } : null,
      availableDecisions: [...approval.availableDecisions],
    })),
  };
}

function activityId(event: AgentEvent) {
  return `activity:${event.itemId ?? event.turnId ?? event.type}`;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => (
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  )).slice(0, 20);
}

function readNetworkApprovalContext(value: unknown): AgentApproval["networkApprovalContext"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const host = readString(record.host).trim();
  const protocol = readString(record.protocol).trim();
  return host && protocol ? { host, protocol } : null;
}

function defaultToolLabel(kind: AgentActivity["kind"]) {
  if (kind === "command") return "Command";
  if (kind === "file-change") return "File changes";
  return "Tool activity";
}

function fileChangeLabel(payload: Record<string, unknown>) {
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  if (changes.length === 0) return "File changes";
  return changes.length === 1 ? "Changed 1 file" : `Changed ${changes.length} files`;
}

function readApprovalDecisions(value: unknown): AgentApproval["availableDecisions"] {
  if (!Array.isArray(value)) return ["accept", "decline", "cancel"];
  const decisions = value.filter((entry): entry is AgentApproval["availableDecisions"][number] => (
    entry === "accept" || entry === "acceptForSession" || entry === "decline" || entry === "cancel"
  ));
  return decisions.length > 0 ? decisions : ["accept", "decline", "cancel"];
}
