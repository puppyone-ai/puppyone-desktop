import type { AgentEvent, AgentTurnTerminalState } from "./agent-contract";
import type {
  AgentActivity,
  AgentPart,
  AgentProjection,
  AgentQuestion,
  AgentTranscriptMessage,
  AgentTurn,
  TimelineRow,
} from "./agent-projection-types";
import {
  activityId,
  defaultToolLabel,
  fileChangeLabel,
  nullableString,
  pickSafeActivityDetail,
  pickUsage,
  readApprovalDecisions,
  readNetworkApprovalContext,
  readProviderMessage,
  readQuestions,
  readRecordArray,
  readString,
} from "./agent-projection-readers";

export type * from "./agent-projection-types";

const MAX_COMMAND_OUTPUT = 64 * 1024;
const PROJECTION_INDEXES = Symbol("agentProjectionIndexes");

type ProjectionIndexes = {
  messages: Map<string, number>;
  messagesByTurn: Map<string, number[]>;
  activities: Map<string, number>;
  turns: Map<string, number>;
  parts: Map<string, number>;
  rows: Map<string, number>;
};

export function createAgentProjection(options: { partialHistory?: boolean } = {}): AgentProjection {
  return {
    sessionState: "empty",
    lastSequence: 0,
    partialHistory: Boolean(options.partialHistory),
    missingRanges: [],
    messages: [],
    activities: [],
    approvals: [],
    questions: [],
    turns: [],
    parts: [],
    rows: [],
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
  const relevant = events
    .filter((event) => event.sequence > initial.lastSequence)
    .sort((left, right) => left.sequence - right.sequence);
  if (relevant.length === 0 && !options.partialHistory) return initial;
  const next = cloneProjection(initial);
  if (options.partialHistory) next.partialHistory = true;
  for (const event of relevant) {
    if (event.sequence <= next.lastSequence) continue;
    applyLegacyAgentEvent(next, event);
    projectTypedPart(next, event);
  }
  return next;
}

export function applyAgentEvent(previous: AgentProjection, event: AgentEvent): AgentProjection {
  if (event.sequence <= previous.lastSequence) return previous;
  const next = cloneProjection(previous);
  applyLegacyAgentEvent(next, event);
  projectTypedPart(next, event);
  return next;
}

function applyLegacyAgentEvent(next: AgentProjection, event: AgentEvent): AgentProjection {
  if (event.sequence <= next.lastSequence) return next;
  if (next.lastSequence > 0 && event.sequence > next.lastSequence + 1) {
    next.partialHistory = true;
    next.missingRanges.push({ from: next.lastSequence + 1, to: event.sequence - 1 });
  } else if (next.lastSequence === 0 && event.sequence > 1) {
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
      const indexes = projectionIndexes(next);
      const turnMessages = event.turnId ? indexes.messagesByTurn.get(event.turnId) ?? [] : [];
      if (prompt && !turnMessages.some((index) => next.messages[index]?.role === "user")) {
        const messageIndex = next.messages.length;
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
        indexes.messages.set(`user:${event.turnId ?? event.sequence}`, messageIndex);
        if (event.turnId) indexes.messagesByTurn.set(event.turnId, [...turnMessages, messageIndex]);
      }
      return next;
    }
    case "turn.completed":
    case "turn.failed":
    case "turn.interrupted": {
      const terminalState = event.type.slice("turn.".length) as AgentTurnTerminalState;
      next.runningTurnId = null;
      next.terminalState = terminalState;
      const indexes = projectionIndexes(next);
      for (const index of event.turnId ? indexes.messagesByTurn.get(event.turnId) ?? [] : []) {
        const message = next.messages[index];
        if (message?.role === "assistant") next.messages[index] = { ...message, streaming: false, terminalState };
      }
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
      const indexes = projectionIndexes(next);
      const existingIndex = indexes.activities.get(id);
      if (existingIndex === undefined) {
        const activity: AgentActivity = {
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
        indexes.activities.set(id, next.activities.length);
        next.activities.push(activity);
      } else {
        const activity = next.activities[existingIndex];
        next.activities[existingIndex] = {
          ...activity,
          output: `${activity.output}${readString(payload.delta)}`.slice(-MAX_COMMAND_OUTPUT),
          sequence: event.sequence,
        };
      }
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
    case "question.requested": {
      const requestId = readString(payload.requestId);
      if (!requestId || !event.turnId || next.questions.some((question) => question.requestId === requestId)) return next;
      next.questions.push({
        requestId,
        turnId: event.turnId,
        itemId: event.itemId,
        questions: readQuestions(payload.questions),
        sequence: event.sequence,
      });
      return next;
    }
    case "question.resolved": {
      const requestId = readString(payload.requestId);
      next.questions = next.questions.filter((question) => question.requestId !== requestId);
      return next;
    }
    case "session.updated":
      return next;
    case "provider.activity":
      return upsertActivity(next, event, {
        kind: "tool",
        label: readString(payload.label) || "Agent activity",
        status: readString(payload.status) || "running",
        detail: pickSafeActivityDetail(payload),
      });
    case "provider.warning":
    case "provider.error":
      const activity: AgentActivity = {
        id: `${event.type}:${event.sequence}`,
        turnId: event.turnId,
        itemId: event.itemId,
        kind: event.type === "provider.error" ? "error" : "warning",
        label: readProviderMessage(payload.message) || (event.type === "provider.error" ? "Provider error" : "Provider warning"),
        status: event.type === "provider.error" ? "failed" : "warning",
        detail: payload,
        output: "",
        sequence: event.sequence,
      };
      projectionIndexes(next).activities.set(activity.id, next.activities.length);
      next.activities.push(activity);
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
  const indexes = projectionIndexes(projection);
  const existingIndex = indexes.messages.get(id);
  if (existingIndex !== undefined) {
    const existing = projection.messages[existingIndex];
    projection.messages[existingIndex] = {
      ...existing,
      text: authoritative ? text : `${existing.text}${text}`,
      streaming,
      sequence: event.sequence,
    };
  } else {
    const messageIndex = projection.messages.length;
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
    indexes.messages.set(id, messageIndex);
    if (event.turnId) {
      indexes.messagesByTurn.set(event.turnId, [...(indexes.messagesByTurn.get(event.turnId) ?? []), messageIndex]);
    }
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
  const indexes = projectionIndexes(projection);
  const existingIndex = indexes.activities.get(id);
  if (existingIndex !== undefined) {
    const existing = projection.activities[existingIndex];
    let detail;
    if (options.appendDetailField) {
      const field = options.appendDetailField;
      detail = {
        ...existing.detail,
        ...value.detail,
        [field]: `${readString(existing.detail[field])}${readString(value.detail[field])}`,
      };
    } else {
      detail = { ...existing.detail, ...value.detail };
    }
    projection.activities[existingIndex] = {
      ...existing,
      label: value.label || existing.label,
      status: value.status,
      detail,
      sequence: event.sequence,
    };
  } else {
    indexes.activities.set(id, projection.activities.length);
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
    messages: [...value.messages],
    activities: [...value.activities],
    approvals: [...value.approvals],
    questions: [...value.questions],
    turns: [...value.turns],
    parts: [...value.parts],
    rows: [...value.rows],
  };
}

function projectionIndexes(projection: AgentProjection): ProjectionIndexes {
  const holder = projection as AgentProjection & { [PROJECTION_INDEXES]?: ProjectionIndexes };
  if (holder[PROJECTION_INDEXES]) return holder[PROJECTION_INDEXES];
  const messagesByTurn = new Map<string, number[]>();
  projection.messages.forEach((message, index) => {
    if (message.turnId) messagesByTurn.set(message.turnId, [...(messagesByTurn.get(message.turnId) ?? []), index]);
  });
  const indexes: ProjectionIndexes = {
    messages: new Map(projection.messages.map((message, index) => [message.id, index])),
    messagesByTurn,
    activities: new Map(projection.activities.map((activity, index) => [activity.id, index])),
    turns: new Map(projection.turns.map((turn, index) => [turn.id, index])),
    parts: new Map(projection.parts.map((part, index) => [part.id, index])),
    rows: new Map(projection.rows.map((row, index) => [row.id, index])),
  };
  Object.defineProperty(holder, PROJECTION_INDEXES, { value: indexes, configurable: true });
  return indexes;
}

function projectTypedPart(projection: AgentProjection, event: AgentEvent) {
  const turn = updateTurn(projection, event);
  if (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.interrupted") {
    const terminalState = event.type.slice("turn.".length) as AgentTurnTerminalState;
    const indexes = projectionIndexes(projection);
    for (const partId of turn?.partIds ?? []) {
      const partIndex = indexes.parts.get(partId);
      const part = partIndex === undefined ? null : projection.parts[partIndex];
      if (partIndex !== undefined && part?.kind === "assistant") {
        projection.parts[partIndex] = { ...part, streaming: false, terminalState };
      }
    }
  }
  const part = partForEvent(projection, event);
  if (!part) return;
  const indexes = projectionIndexes(projection);
  const existingIndex = indexes.parts.get(part.id);
  if (existingIndex !== undefined) projection.parts[existingIndex] = part;
  else {
    indexes.parts.set(part.id, projection.parts.length);
    projection.parts.push(part);
  }
  if (turn && !turn.partIds.includes(part.id)) {
    const turnIndex = indexes.turns.get(turn.id);
    const nextTurn = { ...turn, partIds: [...turn.partIds, part.id] };
    if (turnIndex !== undefined) projection.turns[turnIndex] = nextTurn;
  }
  const row: TimelineRow = {
    id: `row:${part.id}`,
    partId: part.id,
    turnId: part.turnId,
    kind: part.kind,
    sequence: part.sequence,
    estimatedHeight: estimatePartHeight(part),
  };
  const rowIndex = indexes.rows.get(row.id);
  if (rowIndex !== undefined) projection.rows[rowIndex] = row;
  else {
    indexes.rows.set(row.id, projection.rows.length);
    projection.rows.push(row);
  }
}

function updateTurn(projection: AgentProjection, event: AgentEvent) {
  if (!event.turnId) return null;
  const indexes = projectionIndexes(projection);
  let turnIndex = indexes.turns.get(event.turnId);
  let turn = turnIndex === undefined ? null : projection.turns[turnIndex];
  if (!turn) {
    turn = {
      id: event.turnId,
      status: "running",
      startedAtSequence: event.sequence,
      completedAtSequence: null,
      partIds: [],
    };
    turnIndex = projection.turns.length;
    indexes.turns.set(event.turnId, turnIndex);
    projection.turns.push(turn);
  }
  if (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.interrupted") {
    turn = {
      ...turn,
      status: event.type.slice("turn.".length) as AgentTurnTerminalState,
      completedAtSequence: event.sequence,
    };
    if (turnIndex !== undefined) projection.turns[turnIndex] = turn;
  }
  return turn;
}

function partForEvent(projection: AgentProjection, event: AgentEvent): AgentPart | null {
  if (event.type === "turn.started") {
    const indexes = projectionIndexes(projection);
    const message = (event.turnId ? indexes.messagesByTurn.get(event.turnId) ?? [] : [])
      .map((index) => projection.messages[index])
      .find((entry) => entry?.role === "user");
    return message ? messagePart(message) : null;
  }
  if (event.type === "assistant.delta" || event.type === "assistant.completed") {
    const id = `assistant:${event.itemId ?? event.turnId ?? event.sequence}`;
    const messageIndex = projectionIndexes(projection).messages.get(id);
    const message = messageIndex === undefined ? null : projection.messages[messageIndex];
    return message ? messagePart(message) : null;
  }
  if (event.type === "reasoning.summary.delta" || event.type === "plan.updated"
    || event.type.startsWith("tool.") || event.type === "command.output.delta"
    || event.type === "file.change.updated" || event.type === "provider.activity") {
    const activityIndex = projectionIndexes(projection).activities.get(activityId(event));
    const activity = activityIndex === undefined ? null : projection.activities[activityIndex];
    return activity ? activityPart(activity) : null;
  }
  if (event.type === "provider.warning" || event.type === "provider.error") {
    const activityIndex = projectionIndexes(projection).activities.get(`${event.type}:${event.sequence}`);
    const activity = activityIndex === undefined ? null : projection.activities[activityIndex];
    return activity ? activityPart(activity) : null;
  }
  if (event.type === "usage.updated") {
    return { id: "usage:current", turnId: event.turnId, itemId: event.itemId, kind: "usage", usage: pickUsage(event.payload), sequence: event.sequence };
  }
  if (event.type === "approval.requested" || event.type === "approval.resolved") {
    const requestId = readString(event.payload.requestId);
    if (!requestId) return null;
    return { id: `permission:${requestId}`, turnId: event.turnId, itemId: event.itemId, kind: "permission", requestId, state: event.type.endsWith("resolved") ? "resolved" : "pending", sequence: event.sequence };
  }
  if (event.type === "question.requested" || event.type === "question.resolved") {
    const requestId = readString(event.payload.requestId);
    if (!requestId) return null;
    return { id: `question:${requestId}`, turnId: event.turnId, itemId: event.itemId, kind: "question", requestId, state: event.type.endsWith("resolved") ? "resolved" : "pending", sequence: event.sequence };
  }
  if (event.type.startsWith("session.") || event.type.startsWith("turn.")) return null;
  return {
    id: `unknown:${event.type}:${event.itemId ?? event.sequence}`,
    turnId: event.turnId,
    itemId: event.itemId,
    kind: "unknown",
    eventType: event.type,
    label: "Unsupported agent event",
    sequence: event.sequence,
  };
}

function messagePart(message: AgentTranscriptMessage): AgentPart {
  return { ...message, kind: message.role };
}

function activityPart(activity: AgentActivity): AgentPart {
  return { ...activity, detail: pickSafeActivityDetail(activity.detail) };
}

function estimatePartHeight(part: AgentPart) {
  if (part.kind === "user") return 72;
  if (part.kind === "assistant") return Math.min(640, 56 + Math.ceil(part.text.length / 72) * 20);
  if (part.kind === "permission" || part.kind === "question" || part.kind === "usage") return 36;
  return 42;
}
