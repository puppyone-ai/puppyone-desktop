import { createAgentEventEnvelope, countTextBytes, redactSecretText } from "../agent-events.mjs";
import { normalizeAgentEventWorkspacePaths } from "../domain/agent-event-workspace-paths.mjs";

const MAX_REPLAY_EVENTS = 1_000;
const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 750;

/** Owns bounded live-event delivery and process-local recovery snapshots. */
export function createAgentEventJournal({ sessionCache, logger = console }) {
  function sendSessionExit(session, reason) {
    if (session.sender?.isDestroyed?.()) return;
    try {
      session.sender.send("agent:session-exit", { sessionId: session.id, reason });
    } catch (error) {
      logger.warn?.("Unable to deliver Desktop Agent session-exit:", redactSecretText(error?.message || String(error)));
    }
  }

  function emit(session, adapterEvent, { deliver = true } = {}) {
    const normalizedEvent = normalizeAgentEventWorkspacePaths(adapterEvent, session.workspaceRoot);
    const envelope = createAgentEventEnvelope({
      sequence: ++session.sequence,
      sessionId: session.id,
      runtimeId: session.runtimeId,
      providerSessionId: normalizedEvent.providerSessionId ?? session.providerSessionId,
      turnId: normalizedEvent.turnId ?? null,
      itemId: normalizedEvent.itemId ?? null,
      type: normalizedEvent.type,
      payload: normalizedEvent.payload ?? {},
    });
    session.events.push(envelope);
    session.replayBytes += countTextBytes(envelope);
    while (
      session.events.length > MAX_REPLAY_EVENTS
      || (session.replayBytes > MAX_REPLAY_BYTES && session.events.length > 1)
    ) {
      const removed = session.events.shift();
      session.replayBytes -= countTextBytes(removed);
    }
    session.updatedAt = envelope.emittedAt;
    if (deliver && !session.sender.isDestroyed?.()) {
      try {
        session.sender.send("agent:event", envelope);
      } catch (error) {
        logger.warn?.("Unable to deliver Desktop Agent event:", redactSecretText(error?.message || String(error)));
      }
    }
    persistSoon(session);
    return envelope;
  }

  function persistSoon(session) {
    if (session.closing || session.persistTimer) return;
    session.persistTimer = setTimeout(() => {
      session.persistTimer = null;
      void persistNow(session);
    }, PERSIST_DEBOUNCE_MS);
    session.persistTimer.unref?.();
  }

  function persistNow(session) {
    if (!session.providerSessionId) return Promise.resolve();
    const record = {
      sessionId: session.id,
      workspaceRoot: session.workspaceRoot,
      runtimeId: session.runtimeId,
      runtime: session.runtime,
      providerSessionId: session.providerSessionId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      terminalState: session.terminalState,
      selectedModel: session.selectedModel,
      selectedEffort: session.selectedEffort,
      selectedMode: session.selectedMode,
      capabilityRevision: session.capabilities?.revision ?? null,
      lastSequence: session.sequence,
      events: session.events,
    };
    return Promise.resolve(sessionCache.save(record, {
      // Allocation is process-local. A real turn or native resume is the
      // durable-history checkpoint that promotes this locator to the catalog.
      promoteCatalog: hasDurableConversationEvidence(session.events),
    })).catch((error) => {
      logger.warn?.("Unable to update the Agent conversation metadata catalog:", redactSecretText(error?.message || String(error)));
    });
  }

  return { emit, persistNow, persistSoon, sendSessionExit };
}

function hasDurableConversationEvidence(events) {
  return Array.isArray(events) && events.some((event) => (
    event?.type === "turn.started" || event?.type === "session.resumed"
  ));
}

export const agentEventJournalLimits = Object.freeze({
  maxReplayEvents: MAX_REPLAY_EVENTS,
  maxReplayBytes: MAX_REPLAY_BYTES,
  persistDebounceMs: PERSIST_DEBOUNCE_MS,
});
