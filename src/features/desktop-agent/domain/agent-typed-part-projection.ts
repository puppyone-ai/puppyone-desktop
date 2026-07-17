import type { AgentEvent, AgentTurnTerminalState } from "./agent-contract";
import type {
  AgentActivity,
  AgentPart,
  AgentProjection,
  AgentTranscriptMessage,
  TimelineRow,
} from "./agent-projection-types";
import { projectionIndexes } from "./agent-projection-indexes";
import {
  activityId,
  pickSafeActivityDetail,
  pickUsage,
  readProviderMessage,
  readString,
} from "./agent-projection-readers";
import {
  isNonDiagnosticProviderStatusMessage,
  providerActivityIdentity,
} from "./agent-provider-notice-policy";
import { parseAgentEventTime, readAgentTurnDurationMs } from "./agent-turn-timing";

export function projectTypedPart(projection: AgentProjection, event: AgentEvent) {
  const turn = updateTurn(projection, event);
  if (isTerminalTurnEvent(event)) {
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
      startedAtMs: parseAgentEventTime(event.emittedAt),
      completedAtSequence: null,
      durationMs: null,
      partIds: [],
    };
    turnIndex = projection.turns.length;
    indexes.turns.set(event.turnId, turnIndex);
    projection.turns.push(turn);
  }
  if (isTerminalTurnEvent(event)) {
    turn = {
      ...turn,
      status: event.type.slice("turn.".length) as AgentTurnTerminalState,
      completedAtSequence: event.sequence,
      durationMs: readAgentTurnDurationMs(event.payload.durationMs, turn.startedAtMs, event.emittedAt),
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
    const label = readProviderMessage(event.payload.message);
    if (label && isNonDiagnosticProviderStatusMessage(label)) return null;
    const activityIndex = projectionIndexes(projection).activities.get(providerActivityIdentity(
      projection,
      event,
      label || (event.type === "provider.error" ? "error" : "warning"),
    ).id);
    const activity = activityIndex === undefined ? null : projection.activities[activityIndex];
    return activity ? activityPart(activity) : null;
  }
  if (event.type === "usage.updated") {
    return {
      id: "usage:current",
      turnId: event.turnId,
      itemId: event.itemId,
      kind: "usage",
      usage: pickUsage(event.payload),
      sequence: event.sequence,
    };
  }
  if (event.type === "approval.requested" || event.type === "approval.resolved") {
    const requestId = readString(event.payload.requestId);
    if (!requestId) return null;
    return {
      id: `permission:${requestId}`,
      turnId: event.turnId,
      itemId: event.itemId,
      kind: "permission",
      requestId,
      state: event.type.endsWith("resolved") ? "resolved" : "pending",
      sequence: event.sequence,
    };
  }
  if (event.type === "question.requested" || event.type === "question.resolved") {
    const requestId = readString(event.payload.requestId);
    if (!requestId) return null;
    return {
      id: `question:${requestId}`,
      turnId: event.turnId,
      itemId: event.itemId,
      kind: "question",
      requestId,
      state: event.type.endsWith("resolved") ? "resolved" : "pending",
      sequence: event.sequence,
    };
  }
  if (event.type.startsWith("session.") || event.type.startsWith("turn.")) return null;
  return {
    id: `unknown:${event.type}:${event.itemId ?? event.sequence}`,
    turnId: event.turnId,
    itemId: event.itemId,
    kind: "unknown",
    eventType: event.type,
    label: "",
    labelCode: "unsupported-event",
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
  if (part.kind === "user") return 64;
  if (part.kind === "assistant") return Math.min(640, 50 + Math.ceil(part.text.length / 64) * 20);
  if (part.kind === "turn-summary") return 30;
  if (part.kind === "permission" || part.kind === "question" || part.kind === "usage") return 36;
  return 42;
}

function isTerminalTurnEvent(event: AgentEvent) {
  return event.type === "turn.completed"
    || event.type === "turn.failed"
    || event.type === "turn.interrupted";
}
