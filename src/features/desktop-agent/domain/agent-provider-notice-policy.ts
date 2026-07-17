import type { AgentEvent } from "./agent-contract";
import type { AgentProjection } from "./agent-projection-types";

/** Correlates retry warnings and terminal failures without merging separate turns. */
export function providerActivityIdentity(projection: AgentProjection, event: AgentEvent, label: string) {
  const turnId = correlatedProviderTurnId(projection, event);
  const fingerprint = providerMessageFingerprint(label);
  const firstCandidate = Math.max(0, projection.activities.length - 64);
  for (let index = projection.activities.length - 1; index >= firstCandidate; index -= 1) {
    const activity = projection.activities[index];
    if ((activity.kind !== "warning" && activity.kind !== "error")
      || providerMessageFingerprint(activity.label) !== fingerprint) continue;
    if (turnId && activity.turnId && activity.turnId !== turnId) continue;
    if ((!turnId || !activity.turnId) && event.sequence - activity.sequence > 16) continue;
    return { id: activity.id, turnId: turnId ?? activity.turnId };
  }
  return {
    id: providerNoticeId(turnId ?? event.itemId ?? "session", fingerprint),
    turnId,
  };
}

/** Hides persisted lifecycle-only notices emitted by older adapters. */
export function isNonDiagnosticProviderStatusMessage(value: string) {
  return /\bthread entered a system error state\.?$/i.test(value.trim());
}

function correlatedProviderTurnId(projection: AgentProjection, event: AgentEvent) {
  if (event.turnId) return event.turnId;
  if (projection.runningTurnId) return projection.runningTurnId;
  const recentTurn = projection.turns.at(-1);
  if (recentTurn?.completedAtSequence !== null
    && recentTurn?.completedAtSequence !== undefined
    && event.sequence - recentTurn.completedAtSequence <= 16) return recentTurn.id;
  return null;
}

function providerMessageFingerprint(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 2_048);
}

function providerNoticeId(scope: string, fingerprint: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash = Math.imul(hash ^ fingerprint.charCodeAt(index), 16_777_619);
  }
  return `provider-notice:${scope}:${(hash >>> 0).toString(36)}`;
}
