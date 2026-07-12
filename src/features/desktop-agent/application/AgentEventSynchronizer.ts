import { applyAgentEvent, applyAgentEvents } from "../domain/agent-projection";
import type { AgentEvent, AgentSessionMetadata } from "../domain/agent-contract";
import type { AgentControllerState } from "./agent-controller-state";
import { phaseForProjection } from "./agent-controller-state";
import { formatAgentError } from "./agent-error";
import type { AgentClientPort, AgentClientProvider } from "./AgentClientPort";

type StatePatch = (patch: Partial<AgentControllerState>) => void;

const STREAM_BATCH_MS = 32;
const MAX_BUFFERED_EVENTS = 2_000;

export class AgentEventSynchronizer {
  private eventCleanup: (() => void) | null = null;
  private exitCleanup: (() => void) | null = null;
  private connectedBridge: AgentClientPort | null = null;
  private bufferedEvents: AgentEvent[] = [];
  private bufferedSequences = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private replayPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly workspaceRoot: string,
    private readonly bridgeProvider: AgentClientProvider,
    private readonly readState: () => AgentControllerState,
    private readonly patch: StatePatch,
    private readonly onTurnReady: () => void,
  ) {}

  connect() {
    if (this.disposed) return;
    const bridge = this.bridgeProvider();
    if (!bridge || bridge === this.connectedBridge) return;
    this.eventCleanup?.();
    this.exitCleanup?.();
    this.connectedBridge = bridge;
    this.eventCleanup = bridge.onAgentEvent?.((event) => this.enqueue(event)) ?? null;
    this.exitCleanup = bridge.onAgentSessionExit?.((event) => this.handleSessionExit(event)) ?? null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
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
    if (this.disposed) return;
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
    const providerFailure = rejectedProviderPatch(state, projection, applicable);
    this.bufferedEvents.push(...deferred);
    for (const event of deferred) this.bufferedSequences.add(event.sequence);
    this.patch({
      projection,
      phase: phaseForProjection(projection, state.phase),
      stopping: projection.runningTurnId ? state.stopping : false,
      session: state.session
        ? applicable.reduce(updateSessionFromProjectionEvent, state.session)
        : null,
      ...providerFailure,
    });
    if (!projection.runningTurnId) this.onTurnReady();
    if (deferred.length > 0) void this.replayFrom(projection.lastSequence);
  }

  repairFrom(afterSequence: number) {
    if (this.disposed) return Promise.resolve();
    return this.replayFrom(afterSequence);
  }

  private enqueue(event: AgentEvent) {
    if (this.disposed) return;
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
    if (this.disposed) return;
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
    if (this.disposed) return Promise.resolve();
    if (this.replayPromise) return this.replayPromise;
    const sessionId = this.readState().session?.id;
    const bridge = this.bridgeProvider();
    if (!sessionId || !bridge?.replayAgentSession) return Promise.resolve();
    this.replayPromise = (async () => {
      try {
        let cursor = afterSequence;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const snapshot = await bridge.replayAgentSession({ rootPath: this.workspaceRoot, sessionId, afterSequence: cursor });
          if (this.disposed) return;
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
        if (!this.disposed) this.patch({ error: formatAgentError(error) });
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

function rejectedProviderPatch(state: AgentControllerState, projection: AgentControllerState["projection"], events: AgentEvent[]) {
  if (!events.some((event) => event.type === "provider.error") || !state.selectedProviderId || !state.inspection) return {};
  const message = [...projection.activities].reverse().find((activity) => activity.kind === "error")?.label ?? "";
  if (!/(?:api\s*key|credential|authentication|unauthori[sz]ed|forbidden|status\s*401|http\s*401).*(?:invalid|reject|fail|expired|missing)|(?:invalid|reject|fail|expired|missing).*(?:api\s*key|credential|authentication)|api\s*key\s*not\s*valid/i.test(message)) return {};
  const providerId = state.selectedProviderId;
  const providers = (state.inspection.providers ?? []).filter((provider) => provider.id !== providerId);
  const models = state.inspection.models.filter((model) => (model.providerId || modelProviderId(model.model)) !== providerId);
  const providerName = state.inspection.providers?.find((provider) => provider.id === providerId)?.displayName || providerId;
  const hasAlternative = providers.length > 0 && models.length > 0;
  return {
    selectedProviderId: null,
    selectedModel: null,
    inspection: {
      ...state.inspection,
      providers,
      models,
      readiness: hasAlternative
        ? state.inspection.readiness
        : {
          ...state.inspection.readiness,
          status: "installed-not-authenticated" as const,
          message: `${providerName} rejected its credentials. Update or reconnect that provider, then refresh Agent providers.`,
        },
    },
    error: hasAlternative
      ? `${providerName} rejected its credentials. Choose another connected provider, or update it and refresh.`
      : null,
  } satisfies Partial<AgentControllerState>;
}

function modelProviderId(model: string) {
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : null;
}

export const agentEventSynchronizationLimits = Object.freeze({
  streamBatchMs: STREAM_BATCH_MS,
  maxBufferedEvents: MAX_BUFFERED_EVENTS,
});
