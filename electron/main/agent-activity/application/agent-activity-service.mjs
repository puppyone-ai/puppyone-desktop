import { randomUUID } from "node:crypto";
import { AGENT_ACTIVITY_LIMITS, AGENT_ACTIVITY_SCHEMA_VERSION } from "../../../../shared/agent-activity-contract/constants.mjs";
import { parseNormalizedAgentActivitySourceEvent } from "../domain/agent-activity-event.mjs";
import { createActivitySessionRegistry } from "../domain/activity-session-registry.mjs";
import { resolvePublicActivityTarget } from "../security/activity-path-policy.mjs";

export function createAgentActivityService({
  logger = console,
  now = Date.now,
  pathPolicy = resolvePublicActivityTarget,
  publish = () => undefined,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const sessions = createActivitySessionRegistry();
  const claimsByCorrelation = new Map();
  const claimsByActivityId = new Map();

  function registerTerminalSession(session) {
    closeTerminalSession(session.terminalSessionId);
    return sessions.register(session);
  }

  async function ingest(value) {
    const event = parseNormalizedAgentActivitySourceEvent(value);
    if (!event) return false;
    const session = sessions.get(event.terminalSessionId);
    if (!session || (session.providerId !== "*" && session.providerId !== event.providerId)) return false;
    if (event.phase === "started") return startClaim(session, event);
    return finishClaim(session, event);
  }

  async function startClaim(session, event) {
    const targets = (await Promise.all(event.targets.map((candidate) => pathPolicy({
      candidate,
      cwd: event.cwd,
      workspaceRoot: session.workspaceRoot,
    })))).filter(Boolean);
    const exactTargets = dedupeTargets(targets).filter(({ confidence }) => confidence === "exact");
    if (exactTargets.length === 0) return true;

    const correlationKey = createCorrelationKey(event);
    const existing = claimsByCorrelation.get(correlationKey);
    if (existing) {
      refreshClaim(existing, event, exactTargets);
      return true;
    }
    enforceWindowBound(session.webContentsId);
    const claim = {
      activityId: randomUUID(),
      correlationKey,
      event,
      session,
      targets: exactTargets,
      timer: null,
    };
    claimsByCorrelation.set(correlationKey, claim);
    claimsByActivityId.set(claim.activityId, claim);
    armLease(claim);
    publishEvent(claim, "started", event.occurredAt);
    return true;
  }

  function finishClaim(session, event) {
    const claim = claimsByCorrelation.get(createCorrelationKey(event));
    if (!claim || claim.session.terminalSessionId !== session.terminalSessionId) return true;
    removeClaim(claim);
    publishEvent(claim, event.phase, event.occurredAt);
    return true;
  }

  function closeTerminalSession(terminalSessionId) {
    const session = sessions.get(terminalSessionId);
    if (!session) return false;
    for (const claim of Array.from(claimsByActivityId.values())) {
      if (claim.session.terminalSessionId !== terminalSessionId) continue;
      removeClaim(claim);
      publishEvent(claim, "cancelled", now());
    }
    sessions.delete(terminalSessionId);
    return true;
  }

  function closeSourceSession(terminalSessionId, sourceSessionId) {
    for (const claim of Array.from(claimsByActivityId.values())) {
      if (claim.session.terminalSessionId !== terminalSessionId) continue;
      if ((claim.event.sourceSessionId ?? null) !== (sourceSessionId ?? null)) continue;
      removeClaim(claim);
      publishEvent(claim, "cancelled", now());
    }
  }

  function getSnapshotForWindow(webContentsId) {
    const activities = Array.from(claimsByActivityId.values())
      .filter((claim) => claim.session.webContentsId === webContentsId)
      .map((claim) => createPublicEvent(claim, "started", claim.event.occurredAt));
    return Object.freeze({
      schemaVersion: AGENT_ACTIVITY_SCHEMA_VERSION,
      activities: Object.freeze(activities),
    });
  }

  function dispose() {
    for (const claim of claimsByActivityId.values()) clearTimer(claim.timer);
    claimsByActivityId.clear();
    claimsByCorrelation.clear();
    sessions.clear();
  }

  function refreshClaim(claim, event, targets) {
    claim.event = event;
    claim.targets = targets;
    armLease(claim);
    publishEvent(claim, "started", event.occurredAt);
  }

  function armLease(claim) {
    if (claim.timer) clearTimer(claim.timer);
    claim.timer = setTimer(() => {
      if (!claimsByActivityId.has(claim.activityId)) return;
      removeClaim(claim);
      publishEvent(claim, "cancelled", now());
    }, AGENT_ACTIVITY_LIMITS.activeClaimLeaseMs);
    claim.timer?.unref?.();
  }

  function removeClaim(claim) {
    if (claim.timer) clearTimer(claim.timer);
    claim.timer = null;
    claimsByActivityId.delete(claim.activityId);
    claimsByCorrelation.delete(claim.correlationKey);
  }

  function enforceWindowBound(webContentsId) {
    const windowClaims = Array.from(claimsByActivityId.values())
      .filter((claim) => claim.session.webContentsId === webContentsId);
    if (windowClaims.length < AGENT_ACTIVITY_LIMITS.activeClaimsPerWindow) return;
    const oldest = windowClaims.sort((left, right) => left.event.occurredAt - right.event.occurredAt)[0];
    removeClaim(oldest);
    publishEvent(oldest, "cancelled", now());
    logger.warn("Agent activity window claim bound reached; the oldest claim was removed.");
  }

  function publishEvent(claim, phase, occurredAt) {
    publish(claim.session.webContentsId, createPublicEvent(claim, phase, occurredAt));
  }

  return Object.freeze({
    registerTerminalSession,
    ingest,
    closeTerminalSession,
    closeSourceSession,
    getSnapshotForWindow,
    dispose,
  });
}

function createPublicEvent(claim, phase, occurredAt) {
  return Object.freeze({
    schemaVersion: AGENT_ACTIVITY_SCHEMA_VERSION,
    eventId: randomUUID(),
    activityId: claim.activityId,
    providerId: claim.event.providerId,
    terminalSessionId: claim.event.terminalSessionId,
    phase,
    operation: claim.event.operation,
    targets: Object.freeze(claim.targets),
    occurredAt,
  });
}

function createCorrelationKey(event) {
  return [
    event.terminalSessionId,
    event.providerId,
    event.sourceSessionId ?? "",
    event.nativeToolCallId,
  ].join("\0");
}

function dedupeTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.workspaceRelativePath}\0${target.access}\0${target.confidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
