import { applyAgentEvent, applyAgentEvents } from "../domain/agent-projection";
import type { AgentEvent, AgentSessionMetadata } from "../domain/agent-contract";
import type { AgentControllerState } from "./agent-controller-state";
import { phaseForProjection } from "./agent-controller-state";
import { formatAgentError } from "./agent-error";

type AgentBridge = NonNullable<Window["puppyoneDesktop"]>;
type StatePatch = (patch: Partial<AgentControllerState>) => void;

const STREAM_BATCH_MS = 32;
const MAX_BUFFERED_EVENTS = 2_000;

export class AgentEventSynchronizer {
  private eventCleanup: (() => void) | null = null;
  private exitCleanup: (() => void) | null = null;
  private connectedBridge: AgentBridge | null = null;
  private bufferedEvents: AgentEvent[] = [];
  private bufferedSequences = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private replayPromise: Promise<void> | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly bridgeProvider: () => AgentBridge | undefined,
    private readonly readState: () => AgentControllerState,
    private readonly patch: StatePatch,
    private readonly onTurnReady: () => void,
  ) {}

  connect() {
    const bridge = this.bridgeProvider();
    if (!bridge || bridge === this.connectedBridge) return;
    this.eventCleanup?.();
    this.exitCleanup?.();
    this.connectedBridge = bridge;
    this.eventCleanup = bridge.onAgentEvent?.((event) => this.enqueue(event)) ?? null;
    this.exitCleanup = bridge.onAgentSessionExit?.((event) => this.handleSessionExit(event)) ?? null;
  }

  dispose() {
    this.eventCleanup?.();
    this.exitCleanup?.();
    this.eventCleanup = null;
    this.exitCleanup = null;
    this.connectedBridge = null;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.bufferedEvents = [];
    this.bufferedSequences.clear();
  }

  flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.bufferedEvents.length === 0) return;
    const state = this.readState();
    const ordered = this.bufferedEvents.sort((left, right) => left.sequence - right.sequence);
    this.bufferedEvents = [];
    this.bufferedSequences.clear();
    let cursor = state.projection.lastSequence;
    const applicable: AgentEvent[] = [];
    const deferred: AgentEvent[] = [];
    for (const event of ordered) {
      if (event.sequence <= cursor) continue;
      if (event.sequence > cursor + 1) {
        deferred.push(event);
        continue;
      }
      applicable.push(event);
      cursor = event.sequence;
    }
    const projection = applyAgentEvents(state.projection, applicable);
    this.bufferedEvents.push(...deferred);
    for (const event of deferred) this.bufferedSequences.add(event.sequence);
    this.patch({
      projection,
      phase: phaseForProjection(projection, state.phase),
      stopping: projection.runningTurnId ? state.stopping : false,
      session: state.session
        ? applicable.reduce(updateSessionFromProjectionEvent, state.session)
        : null,
    });
    if (!projection.runningTurnId) this.onTurnReady();
    if (deferred.length > 0) void this.replayFrom(projection.lastSequence);
  }

  repairFrom(afterSequence: number) {
    return this.replayFrom(afterSequence);
  }

  private enqueue(event: AgentEvent) {
    const state = this.readState();
    if (event.sessionId !== state.session?.id) return;
    if (event.sequence <= state.projection.lastSequence) return;
    if (!this.bufferedSequences.has(event.sequence)) {
      this.bufferedEvents.push(event);
      this.bufferedSequences.add(event.sequence);
    }
    if (this.bufferedEvents.length > MAX_BUFFERED_EVENTS) {
      const removed = this.bufferedEvents.splice(0, this.bufferedEvents.length - MAX_BUFFERED_EVENTS);
      for (const entry of removed) this.bufferedSequences.delete(entry.sequence);
    }
    if (isUrgentEvent(event) || event.sequence > state.projection.lastSequence + 1) {
      this.flush();
      return;
    }
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), STREAM_BATCH_MS);
  }

  private handleSessionExit(event: { sessionId: string; reason: string }) {
    const state = this.readState();
    if (event.sessionId !== state.session?.id || event.reason !== "provider-exited") return;
    this.flush();
    const latest = this.readState();
    if (!latest.session) return;
    const projection = {
      ...latest.projection,
      approvals: [],
      questions: [],
      runningTurnId: null,
      terminalState: latest.projection.runningTurnId ? "failed" as const : latest.projection.terminalState,
    };
    const runtimeName = latest.session.runtime?.displayName
      || latest.inspection?.runtime?.displayName
      || latest.inspection?.runtimes?.find((entry) => entry.descriptor.id === latest.selectedRuntimeId)?.descriptor.displayName
      || humanizeRuntimeId(latest.selectedRuntimeId || latest.session.runtimeId || latest.session.provider)
      || "Agent runtime";
    this.patch({
      session: { ...latest.session, activeTurnId: null, terminalState: "provider-exited" },
      projection,
      phase: "runtime-exited",
      stopping: false,
      submitting: false,
      resolvingBlocker: false,
      error: `${runtimeName} stopped unexpectedly. Files already changed were not reverted. Refresh to resume the saved session.`,
    });
  }

  private replayFrom(afterSequence: number) {
    if (this.replayPromise) return this.replayPromise;
    const sessionId = this.readState().session?.id;
    const bridge = this.bridgeProvider();
    if (!sessionId || !bridge?.replayAgentSession) return Promise.resolve();
    this.replayPromise = (async () => {
      try {
        let cursor = afterSequence;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const snapshot = await bridge.replayAgentSession({ rootPath: this.workspaceRoot, sessionId, afterSequence: cursor });
          const state = this.readState();
          if (state.session?.id !== sessionId) return;
          let projection = applyAgentEvents(state.projection, snapshot.events, { partialHistory: snapshot.partial });
          const buffered = this.bufferedEvents.sort((left, right) => left.sequence - right.sequence);
          this.bufferedEvents = [];
          this.bufferedSequences.clear();
          for (const event of buffered) {
            if (event.sequence <= projection.lastSequence + 1) projection = applyAgentEvent(projection, event);
            else {
              this.bufferedEvents.push(event);
              this.bufferedSequences.add(event.sequence);
            }
          }
          this.patch({
            projection,
            phase: phaseForProjection(projection, state.phase),
            session: {
              ...snapshot.session,
              activeTurnId: projection.runningTurnId,
              terminalState: projection.runningTurnId ? "running" : projection.terminalState || snapshot.session.terminalState,
              lastSequence: projection.lastSequence,
            },
          });
          cursor = projection.lastSequence;
          if (this.bufferedEvents.length === 0) return;
        }
        this.patch({ error: "Part of the live Agent event stream could not be repaired. Refresh to replay saved history." });
      } catch (error) {
        this.patch({ error: formatAgentError(error) });
      }
    })().finally(() => { this.replayPromise = null; });
    return this.replayPromise;
  }
}

function updateSessionFromProjectionEvent(session: AgentSessionMetadata, event?: AgentEvent) {
  if (!event) return session;
  const terminal = event.type === "turn.completed" ? "completed"
    : event.type === "turn.failed" ? "failed"
      : event.type === "turn.interrupted" ? "interrupted"
        : null;
  return {
    ...session,
    title: event.type === "session.updated" && typeof event.payload.title === "string" ? event.payload.title : session.title,
    lastSequence: Math.max(session.lastSequence, event.sequence),
    updatedAt: event.emittedAt,
    activeTurnId: event.type === "turn.started" ? event.turnId : terminal ? null : session.activeTurnId,
    terminalState: event.type === "turn.started" ? "running" : terminal || session.terminalState,
  };
}

function isUrgentEvent(event: AgentEvent) {
  return event.type.startsWith("approval.")
    || event.type.startsWith("question.")
    || event.type === "turn.completed"
    || event.type === "turn.failed"
    || event.type === "turn.interrupted"
    || event.type === "provider.error";
}

function humanizeRuntimeId(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export const agentEventSynchronizationLimits = Object.freeze({
  streamBatchMs: STREAM_BATCH_MS,
  maxBufferedEvents: MAX_BUFFERED_EVENTS,
});
