import type { AgentEvent, AgentTurnTerminalState } from "./agent-contract";
import type {
  AgentActivity,
  AgentProjection,
} from "./agent-projection-types";
import { clearProjectedFileChange, hasRenderableFileChange } from "./agent-file-change-projection";
import {
  activityId,
  defaultToolLabelCode,
  fileChangeLabelCode,
  nullableString,
  pickSafeActivityDetail,
  pickUsage,
  readApprovalDecisions,
  readNetworkApprovalContext,
  readProviderMessage,
  normalizeAgentActivityStatus,
  readQuestions,
  readRecordArray,
  readString,
} from "./agent-projection-readers";
import {
  cloneAgentProjection,
  projectionIndexes,
} from "./agent-projection-indexes";
import {
  isNonDiagnosticProviderStatusMessage,
  providerActivityIdentity,
} from "./agent-provider-notice-policy";
import { projectTypedPart } from "./agent-typed-part-projection";

export type * from "./agent-projection-types";

const MAX_COMMAND_OUTPUT = 64 * 1024;
const MAX_MESSAGE_TEXT = 128 * 1024;
const MAX_ACTIVITY_TEXT = 64 * 1024;

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
  const next = cloneAgentProjection(initial);
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
  const next = cloneAgentProjection(previous);
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
      const prompt = readString(payload.prompt).slice(0, MAX_MESSAGE_TEXT);
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
        label: "",
        labelCode: "reasoning-summary",
        status: payload.completed ? "completed" : "running",
        detail: payload,
      }, { appendDetailField: "delta" });
    case "plan.updated":
      return upsertActivity(next, { ...event, itemId: event.itemId ?? "current-plan" }, {
        kind: "plan",
        label: "",
        labelCode: "plan-updated",
        status: payload.completed ? "completed" : "running",
        detail: payload,
      });
    case "tool.started":
    case "tool.progress":
    case "tool.completed": {
      const kind = payload.kind === "command" ? "command" : payload.kind === "file-change" ? "file-change" : "tool";
      return upsertActivity(next, event, {
        kind,
        label: readString(payload.label),
        labelCode: readString(payload.label) ? undefined : defaultToolLabelCode(kind),
        status: normalizeAgentActivityStatus(payload.status, event.type === "tool.completed" ? "completed" : "running"),
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
          label: "",
          labelCode: "command-output",
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
      if (!hasRenderableFileChange(payload)) {
        clearProjectedFileChange(next, event);
        return next;
      }
      return upsertActivity(next, event, {
        kind: "file-change",
        label: "",
        labelCode: fileChangeLabelCode(payload),
        status: normalizeAgentActivityStatus(payload.status, "running"),
        detail: payload,
      });
    case "usage.updated":
      next.usage = pickUsage(payload);
      return next;
    case "approval.requested": {
      const requestId = readString(payload.requestId);
      if (!requestId || !event.turnId || next.approvals.some((approval) => approval.requestId === requestId)) return next;
      next.approvals.push({
        requestId,
        turnId: event.turnId,
        itemId: event.itemId,
        kind: payload.kind === "file-change" ? "file-change" : "command",
        title: readString(payload.title),
        titleCode: readString(payload.title) ? undefined : "approval-required",
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
        label: readString(payload.label),
        labelCode: readString(payload.label) ? undefined : "agent-activity",
        status: normalizeAgentActivityStatus(payload.status, "running"),
        detail: pickSafeActivityDetail(payload),
      });
    case "provider.warning":
    case "provider.error": {
      const kind = event.type === "provider.error" ? "error" : "warning";
      const label = readProviderMessage(payload.message);
      if (label && isNonDiagnosticProviderStatusMessage(label)) return next;
      const identity = providerActivityIdentity(next, event, label || kind);
      const activityIndexes = projectionIndexes(next).activities;
      const existingActivityIndex = activityIndexes.get(identity.id);
      const existingActivity = existingActivityIndex === undefined ? null : next.activities[existingActivityIndex];
      if (existingActivity?.kind === "error" && kind === "warning") return next;
      const activity: AgentActivity = {
        id: identity.id,
        turnId: identity.turnId,
        itemId: event.itemId ?? existingActivity?.itemId ?? null,
        kind,
        label,
        labelCode: label ? undefined : kind === "error" ? "provider-error" : "provider-warning",
        status: kind === "error" ? "failed" : "warning",
        detail: pickSafeActivityDetail(payload),
        output: "",
        sequence: event.sequence,
      };
      if (existingActivityIndex === undefined) {
        activityIndexes.set(activity.id, next.activities.length);
        next.activities.push(activity);
      } else {
        next.activities[existingActivityIndex] = activity;
      }
      return next;
    }
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
      text: authoritative
        ? text.slice(0, MAX_MESSAGE_TEXT)
        : appendBounded(existing.text, text, MAX_MESSAGE_TEXT),
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
      text: text.slice(0, MAX_MESSAGE_TEXT),
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
  value: Pick<AgentActivity, "kind" | "label" | "labelCode" | "status" | "detail">,
  options: { appendDetailField?: string } = {},
) {
  const id = activityId(event);
  const indexes = projectionIndexes(projection);
  const existingIndex = indexes.activities.get(id);
  const safeDetail = pickSafeActivityDetail(value.detail);
  if (existingIndex !== undefined) {
    const existing = projection.activities[existingIndex];
    let detail;
    if (options.appendDetailField) {
      const field = options.appendDetailField;
      detail = {
        ...existing.detail,
        ...safeDetail,
        [field]: appendBounded(
          readString(existing.detail[field]),
          readString(safeDetail[field]),
          MAX_ACTIVITY_TEXT,
        ),
      };
    } else {
      detail = { ...existing.detail, ...safeDetail };
    }
    projection.activities[existingIndex] = {
      ...existing,
      label: value.label || existing.label,
      labelCode: value.label ? undefined : value.labelCode ?? existing.labelCode,
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
      detail: safeDetail,
      output: "",
      sequence: event.sequence,
    });
  }
  return projection;
}

function appendBounded(current: string, incoming: string, limit: number) {
  const remaining = limit - current.length;
  return remaining > 0 ? `${current}${incoming.slice(0, remaining)}` : current.slice(0, limit);
}

export const agentProjectionLimits = Object.freeze({
  maxMessageText: MAX_MESSAGE_TEXT,
  maxCommandOutput: MAX_COMMAND_OUTPUT,
  maxActivityText: MAX_ACTIVITY_TEXT,
});
