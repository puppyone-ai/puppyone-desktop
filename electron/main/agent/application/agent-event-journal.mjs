import { createAgentEventEnvelope, countTextBytes, redactSecretText } from "../agent-events.mjs";

const MAX_REPLAY_EVENTS = 1_000;
const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 750;

/** Owns bounded event delivery and durable journal writes for live session records. */
export function createAgentEventJournal({ persistence, logger = console }) {
  function sendSessionExit(session, reason) {
    if (session.sender?.isDestroyed?.()) return;
    try {
      session.sender.send("agent:session-exit", { sessionId: session.id, reason });
    } catch (error) {
      logger.warn?.("Unable to deliver Desktop Agent session-exit:", redactSecretText(error?.message || String(error)));
    }
  }

  function emit(session, adapterEvent, { deliver = true } = {}) {
    const envelope = createAgentEventEnvelope({
      sequence: ++session.sequence,
      sessionId: session.id,
      runtimeId: session.runtimeId,
      providerSessionId: adapterEvent.providerSessionId ?? session.providerSessionId,
      turnId: adapterEvent.turnId ?? null,
      itemId: adapterEvent.itemId ?? null,
      type: adapterEvent.type,
      payload: adapterEvent.payload ?? {},
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
    return persistence.save({
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
      selectedMode: session.selectedMode,
      lastSequence: session.sequence,
      events: session.events,
    });
  }

  return { emit, persistNow, persistSoon, sendSessionExit };
}

export const agentEventJournalLimits = Object.freeze({
  maxReplayEvents: MAX_REPLAY_EVENTS,
  maxReplayBytes: MAX_REPLAY_BYTES,
  persistDebounceMs: PERSIST_DEBOUNCE_MS,
});
