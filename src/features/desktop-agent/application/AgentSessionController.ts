import { applyAgentEvent, applyAgentEvents, createAgentProjection, type AgentProjection } from "../agentProjection";
import type {
  AgentApprovalDecision,
  AgentEvent,
  AgentFileReference,
  AgentProviderInspection,
  AgentQuestionResolution,
  AgentRuntimeId,
  AgentSessionListItem,
  AgentSessionMetadata,
  AgentSessionSnapshot,
} from "../agentTypes";

export type AgentControllerPhase =
  | "idle"
  | "discovering"
  | "restoring"
  | "ready"
  | "creating"
  | "running"
  | "waiting"
  | "runtime-exited"
  | "failed";

export type AgentControllerState = {
  phase: AgentControllerPhase;
  inspection: AgentProviderInspection | null;
  session: AgentSessionMetadata | null;
  history: AgentSessionListItem[];
  projection: AgentProjection;
  selectedRuntimeId: AgentRuntimeId | null;
  selectedModel: string | null;
  selectedMode: string | null;
  draft: string;
  attachments: AgentFileReference[];
  contextReferences: AgentFileReference[];
  error: string | null;
  submitting: boolean;
  stopping: boolean;
  resolvingBlocker: boolean;
  initialized: boolean;
};

type AgentBridge = NonNullable<Window["puppyoneDesktop"]>;
type Listener = () => void;

const STREAM_BATCH_MS = 32;
const MAX_BUFFERED_EVENTS = 2_000;
const MAX_CACHED_SESSIONS = 100;

export const agentControllerTransitions: Readonly<Record<AgentControllerPhase, readonly AgentControllerPhase[]>> = Object.freeze({
  idle: ["discovering", "restoring", "creating", "ready", "failed"],
  discovering: ["restoring", "ready", "failed"],
  restoring: ["ready", "running", "failed", "runtime-exited"],
  ready: ["discovering", "restoring", "creating", "running", "waiting", "failed", "runtime-exited"],
  creating: ["ready", "running", "failed", "runtime-exited"],
  running: ["running", "waiting", "ready", "failed", "runtime-exited"],
  waiting: ["waiting", "running", "ready", "failed", "runtime-exited"],
  "runtime-exited": ["discovering", "restoring", "creating", "ready", "failed"],
  failed: ["discovering", "restoring", "creating", "ready", "runtime-exited"],
});

type SessionUiState = { draft: string; scrollTop: number; measurements: Record<string, number>; pinned: boolean };

export class AgentSessionController {
  readonly workspaceRoot: string;
  private state: AgentControllerState;
  private listeners = new Set<Listener>();
  private eventCleanup: (() => void) | null = null;
  private exitCleanup: (() => void) | null = null;
  private connectedBridge: AgentBridge | null = null;
  private bufferedEvents: AgentEvent[] = [];
  private bufferedSequences = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private replayPromise: Promise<void> | null = null;
  private initializePromise: Promise<void> | null = null;
  private sessionUi = new Map<string, SessionUiState>();
  private queuedPrompts: string[] = [];

  constructor(workspaceRoot: string, private readonly bridgeProvider: () => AgentBridge | undefined = () => window.puppyoneDesktop) {
    this.workspaceRoot = workspaceRoot;
    this.state = {
      phase: "idle",
      inspection: null,
      session: null,
      history: [],
      projection: createAgentProjection(),
      selectedRuntimeId: null,
      selectedModel: null,
      selectedMode: null,
      draft: "",
      attachments: [],
      contextReferences: [],
      error: null,
      submitting: false,
      stopping: false,
      resolvingBlocker: false,
      initialized: false,
    };
    this.connectEventStream();
  }

  getSnapshot = () => this.state;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  hasSubscribers() {
    return this.listeners.size > 0;
  }

  /** Releases renderer subscriptions only; it never sends a runtime stop. */
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
    this.listeners.clear();
  }

  async initialize(refresh = false) {
    if (this.initializePromise && !refresh) return this.initializePromise;
    this.initializePromise = this.runInitialize(refresh).finally(() => { this.initializePromise = null; });
    return this.initializePromise;
  }

  private async runInitialize(refresh: boolean) {
    this.connectEventStream();
    const bridge = this.requireBridge("discoverAgentProviders", "resumeAgentSession");
    this.patch({ phase: "discovering", error: null });
    try {
      const inspection = await bridge.discoverAgentProviders({
        rootPath: this.workspaceRoot,
        runtimeId: this.state.selectedRuntimeId,
        refresh,
      });
      const runtimeId = inspection.selectedRuntimeId
        || inspection.runtime?.id
        || inspection.readiness.runtimeId
        || inspection.readiness.provider
        || null;
      const selectedModel = chooseModel(inspection, this.state.selectedModel);
      const selectedMode = chooseMode(inspection, this.state.selectedMode);
      this.patch({ inspection, selectedRuntimeId: runtimeId, selectedModel, selectedMode, initialized: true });
      if (inspection.readiness.status !== "ready") {
        this.patch({ phase: "ready" });
        await this.refreshHistory();
        return;
      }
      this.patch({ phase: "restoring" });
      const restored = await bridge.resumeAgentSession({ rootPath: this.workspaceRoot, runtimeId });
      if (restored) this.applySnapshot(restored);
      this.patch({ phase: restored?.session.activeTurnId ? "running" : "ready" });
      await this.refreshHistory();
    } catch (error) {
      this.patch({ phase: "failed", error: formatAgentError(error), initialized: true });
    }
  }

  async selectRuntime(runtimeId: string) {
    if (!runtimeId || runtimeId === this.state.selectedRuntimeId) return;
    if (this.state.projection.runningTurnId) throw new Error("Stop the active turn before switching runtime.");
    await this.closeActiveSession(false);
    this.saveSessionUi();
    this.state = {
      ...this.state,
      selectedRuntimeId: runtimeId,
      session: null,
      projection: createAgentProjection(),
      inspection: null,
      selectedModel: null,
      selectedMode: null,
      attachments: [],
      contextReferences: [],
    };
    this.emit();
    await this.initialize(true);
  }

  selectModel(model: string | null) {
    this.patch({ selectedModel: model || null });
  }

  selectMode(mode: string | null) {
    this.patch({ selectedMode: mode || null });
  }

  setDraft(draft: string) {
    this.patch({ draft });
    this.writeCurrentSessionUi({ draft });
  }

  addAttachments(references: AgentFileReference[]) {
    this.patch({ attachments: mergeReferences(this.state.attachments, references) });
  }

  removeAttachment(path: string) {
    this.patch({ attachments: this.state.attachments.filter((entry) => entry.path !== path) });
  }

  addContextReferences(references: AgentFileReference[]) {
    this.patch({ contextReferences: mergeReferences(this.state.contextReferences, references) });
  }

  removeContextReference(path: string) {
    this.patch({ contextReferences: this.state.contextReferences.filter((entry) => entry.path !== path) });
  }

  rememberViewport(scrollTop: number, measurements: Record<string, number> = {}, pinned = true) {
    this.writeCurrentSessionUi({ scrollTop, measurements, pinned });
  }

  readViewport() {
    return this.readSessionUi(this.uiKey());
  }

  async newSession() {
    if (this.state.projection.runningTurnId) throw new Error("Stop the active turn before starting a new session.");
    this.saveSessionUi();
    try {
      await this.closeActiveSession(false);
      this.patch({
        phase: "creating",
        session: null,
        projection: createAgentProjection(),
        error: null,
        attachments: [],
        contextReferences: [],
      });
      const snapshot = await this.createSession();
      this.applySnapshot(snapshot);
      this.restoreSessionUi();
      this.patch({ phase: "ready" });
      await this.refreshHistory();
    } catch (error) {
      this.patch({ phase: "failed", error: formatAgentError(error) });
    }
  }

  async switchSession(sessionId: string) {
    if (!sessionId || sessionId === this.state.session?.id) return;
    if (this.state.projection.runningTurnId) throw new Error("Stop the active turn before switching sessions.");
    this.saveSessionUi();
    try {
      await this.closeActiveSession(false);
      this.patch({ phase: "restoring", session: null, projection: createAgentProjection(), error: null });
      const bridge = this.requireBridge("resumeAgentSession");
      const snapshot = await bridge.resumeAgentSession({
        rootPath: this.workspaceRoot,
        sessionId,
        runtimeId: this.state.selectedRuntimeId,
      });
      if (!snapshot) throw new Error("The saved Agent session is no longer available.");
      this.applySnapshot(snapshot);
      this.restoreSessionUi();
      this.patch({ phase: snapshot.session.activeTurnId ? "running" : "ready" });
    } catch (error) {
      this.patch({ phase: "failed", error: formatAgentError(error) });
    }
  }

  async submit(prompt: string) {
    const bridge = this.requireBridge("startAgentTurn");
    const text = prompt.trim();
    if (!text || this.state.submitting) return false;
    const activeTurnId = this.state.projection.runningTurnId;
    if (activeTurnId && this.state.session && this.state.inspection?.capabilities?.steer && bridge.steerAgentTurn) {
      await bridge.steerAgentTurn({ rootPath: this.workspaceRoot, sessionId: this.state.session.id, turnId: activeTurnId, message: text });
      this.patch({ draft: "" });
      return true;
    }
    if (activeTurnId && this.state.inspection?.capabilities?.queue) {
      this.queuedPrompts.push(text);
      this.patch({ draft: "" });
      return true;
    }
    if (activeTurnId) return false;
    this.patch({ submitting: true, error: null });
    try {
      let session = this.state.session;
      if (!session) {
        const snapshot = await this.createSession();
        this.applySnapshot(snapshot);
        session = snapshot.session;
      }
      await bridge.startAgentTurn({
        rootPath: this.workspaceRoot,
        sessionId: session.id,
        prompt: text,
        model: this.state.selectedModel,
        mode: this.state.selectedMode,
        attachments: this.state.attachments,
        contextReferences: this.state.contextReferences,
      });
      this.patch({ draft: "", attachments: [], contextReferences: [], phase: "running" });
      this.writeCurrentSessionUi({ draft: "" });
      return true;
    } catch (error) {
      this.patch({ error: formatAgentError(error) });
      return false;
    } finally {
      this.patch({ submitting: false });
    }
  }

  async stop() {
    const sessionId = this.state.session?.id;
    const turnId = this.state.projection.runningTurnId;
    if (!sessionId || !turnId) return;
    const bridge = this.requireBridge("interruptAgentTurn");
    this.patch({ stopping: true, error: null });
    try {
      await bridge.interruptAgentTurn({ rootPath: this.workspaceRoot, sessionId, turnId });
    } catch (error) {
      this.patch({ stopping: false, error: formatAgentError(error) });
    }
  }

  async resolveApproval(decision: AgentApprovalDecision) {
    const approval = this.state.projection.approvals[0];
    const session = this.state.session;
    if (!approval || !session) return;
    const bridge = this.requireBridge("resolveAgentApproval");
    this.patch({ resolvingBlocker: true, error: null });
    try {
      await bridge.resolveAgentApproval({
        rootPath: this.workspaceRoot,
        sessionId: session.id,
        turnId: approval.turnId,
        requestId: approval.requestId,
        decision,
      });
    } catch (error) {
      this.patch({ error: formatAgentError(error) });
      await this.replayFrom(this.state.projection.lastSequence);
    } finally {
      this.patch({ resolvingBlocker: false });
    }
  }

  async resolveQuestion(resolution: Omit<AgentQuestionResolution, "rootPath" | "sessionId" | "turnId" | "requestId">) {
    const question = this.state.projection.questions[0];
    const session = this.state.session;
    if (!question || !session) return;
    const bridge = this.requireBridge("resolveAgentQuestion");
    this.patch({ resolvingBlocker: true, error: null });
    try {
      await bridge.resolveAgentQuestion({
        ...resolution,
        rootPath: this.workspaceRoot,
        sessionId: session.id,
        turnId: question.turnId,
        requestId: question.requestId,
      });
    } catch (error) {
      this.patch({ error: formatAgentError(error) });
      await this.replayFrom(this.state.projection.lastSequence);
    } finally {
      this.patch({ resolvingBlocker: false });
    }
  }

  async forkSession() {
    const sessionId = this.state.session?.id;
    if (!sessionId) return;
    const bridge = this.requireBridge("forkAgentSession");
    this.saveSessionUi();
    this.patch({ phase: "restoring", error: null });
    try {
      const snapshot = await bridge.forkAgentSession({ rootPath: this.workspaceRoot, sessionId });
      this.applySnapshot(snapshot);
      this.restoreSessionUi();
      this.patch({ phase: "ready" });
      await this.refreshHistory();
    } catch (error) {
      this.patch({ phase: "failed", error: formatAgentError(error) });
    }
  }

  async archiveSession(sessionId = this.state.session?.id) {
    if (!sessionId) return;
    try {
      const bridge = this.requireBridge("archiveAgentSession");
      await bridge.archiveAgentSession({ rootPath: this.workspaceRoot, sessionId, archiveNative: false });
      if (sessionId === this.state.session?.id) {
        this.saveSessionUi();
        this.patch({ session: null, projection: createAgentProjection(), phase: "ready" });
      }
      await this.refreshHistory();
    } catch (error) {
      this.patch({ error: formatAgentError(error) });
    }
  }

  async deleteSession(sessionId = this.state.session?.id) {
    if (!sessionId) return;
    try {
      const bridge = this.requireBridge("deleteAgentSession");
      await bridge.deleteAgentSession({ rootPath: this.workspaceRoot, sessionId, deleteNative: false });
      this.sessionUi.delete(sessionId);
      if (sessionId === this.state.session?.id) {
        this.patch({ session: null, projection: createAgentProjection(), phase: "ready" });
      }
      await this.refreshHistory();
    } catch (error) {
      this.patch({ error: formatAgentError(error) });
    }
  }

  async compactSession() {
    const sessionId = this.state.session?.id;
    if (!sessionId) return;
    try {
      const bridge = this.requireBridge("compactAgentSession");
      await bridge.compactAgentSession({ rootPath: this.workspaceRoot, sessionId });
    } catch (error) {
      this.patch({ error: formatAgentError(error) });
    }
  }

  async refreshHistory() {
    const bridge = this.bridgeProvider();
    if (!bridge?.listAgentSessions) return;
    try {
      const history = await bridge.listAgentSessions({ rootPath: this.workspaceRoot });
      this.patch({ history: history.slice(0, MAX_CACHED_SESSIONS) });
    } catch {
      // History is additive; failure must not take down an otherwise usable chat.
    }
  }

  private async createSession() {
    const bridge = this.requireBridge("createAgentSession");
    return bridge.createAgentSession({
      rootPath: this.workspaceRoot,
      runtimeId: this.state.selectedRuntimeId,
      model: this.state.selectedModel,
      mode: this.state.selectedMode,
    });
  }

  private applySnapshot(snapshot: AgentSessionSnapshot) {
    this.flushBufferedEvents();
    const inspection = this.state.inspection ? {
      ...this.state.inspection,
      runtime: snapshot.runtime ?? snapshot.session.runtime ?? this.state.inspection.runtime,
      account: snapshot.account,
      models: snapshot.models,
      modes: snapshot.modes ?? this.state.inspection.modes ?? [],
      commands: snapshot.commands ?? this.state.inspection.commands ?? [],
      capabilities: snapshot.capabilities,
    } : null;
    this.patch({
      session: snapshot.session,
      inspection,
      selectedRuntimeId: snapshot.session.runtimeId || snapshot.session.provider || this.state.selectedRuntimeId,
      selectedModel: snapshot.session.selectedModel || this.state.selectedModel || chooseModel(inspection, null),
      selectedMode: snapshot.session.selectedMode || this.state.selectedMode || chooseMode(inspection, null),
      projection: applyAgentEvents(createAgentProjection({ partialHistory: snapshot.partial }), snapshot.events, { partialHistory: snapshot.partial }),
      stopping: false,
    });
  }

  private connectEventStream() {
    const bridge = this.bridgeProvider();
    if (!bridge || bridge === this.connectedBridge) return;
    this.eventCleanup?.();
    this.exitCleanup?.();
    this.connectedBridge = bridge;
    this.eventCleanup = bridge?.onAgentEvent?.((event) => this.enqueueEvent(event)) ?? null;
    this.exitCleanup = bridge?.onAgentSessionExit?.((event) => {
      if (event.sessionId !== this.state.session?.id || event.reason !== "provider-exited") return;
      this.flushBufferedEvents();
      const projection = {
        ...this.state.projection,
        approvals: [],
        questions: [],
        runningTurnId: null,
        terminalState: this.state.projection.runningTurnId ? "failed" as const : this.state.projection.terminalState,
      };
      const runtimeName = this.state.session.runtime?.displayName
        || this.state.inspection?.runtime?.displayName
        || (this.state.selectedRuntimeId === "codex" ? "Codex" : this.state.selectedRuntimeId === "opencode" ? "OpenCode" : "Agent runtime");
      this.patch({
        session: { ...this.state.session, activeTurnId: null, terminalState: "provider-exited" },
        projection,
        phase: "runtime-exited",
        stopping: false,
        submitting: false,
        resolvingBlocker: false,
        error: `${runtimeName} stopped unexpectedly. Files already changed were not reverted. Refresh to resume the saved session.`,
      });
    }) ?? null;
  }

  private enqueueEvent(event: AgentEvent) {
    if (event.sessionId !== this.state.session?.id) return;
    if (event.sequence <= this.state.projection.lastSequence) return;
    if (!this.bufferedSequences.has(event.sequence)) {
      this.bufferedEvents.push(event);
      this.bufferedSequences.add(event.sequence);
    }
    if (this.bufferedEvents.length > MAX_BUFFERED_EVENTS) {
      const removed = this.bufferedEvents.splice(0, this.bufferedEvents.length - MAX_BUFFERED_EVENTS);
      for (const entry of removed) this.bufferedSequences.delete(entry.sequence);
    }
    if (isUrgentEvent(event) || event.sequence > this.state.projection.lastSequence + 1) {
      this.flushBufferedEvents();
      return;
    }
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flushBufferedEvents(), STREAM_BATCH_MS);
  }

  private flushBufferedEvents() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.bufferedEvents.length === 0) return;
    const ordered = this.bufferedEvents.sort((left, right) => left.sequence - right.sequence);
    this.bufferedEvents = [];
    this.bufferedSequences.clear();
    let cursor = this.state.projection.lastSequence;
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
    const projection = applyAgentEvents(this.state.projection, applicable);
    this.bufferedEvents.push(...deferred);
    for (const event of deferred) this.bufferedSequences.add(event.sequence);
    const terminal = projection.terminalState;
    const phase = projection.runningTurnId
      ? projection.approvals.length || projection.questions.length ? "waiting" : "running"
      : terminal ? "ready" : this.state.phase;
    this.patch({
      projection,
      phase,
      stopping: projection.runningTurnId ? this.state.stopping : false,
      session: this.state.session
        ? applicable.reduce(updateSessionFromProjectionEvent, this.state.session)
        : null,
    });
    if (!projection.runningTurnId && this.queuedPrompts.length > 0) {
      const prompt = this.queuedPrompts.shift();
      if (prompt) queueMicrotask(() => { void this.submit(prompt); });
    }
    if (deferred.length > 0) void this.replayFrom(projection.lastSequence);
  }

  private replayFrom(afterSequence: number) {
    if (this.replayPromise) return this.replayPromise;
    const sessionId = this.state.session?.id;
    const bridge = this.bridgeProvider();
    if (!sessionId || !bridge?.replayAgentSession) return Promise.resolve();
    this.replayPromise = (async () => {
      try {
        let cursor = afterSequence;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const snapshot = await bridge.replayAgentSession({ rootPath: this.workspaceRoot, sessionId, afterSequence: cursor });
          if (this.state.session?.id !== sessionId) return;
          let projection = applyAgentEvents(this.state.projection, snapshot.events, { partialHistory: snapshot.partial });
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
          const phase = projection.runningTurnId
            ? projection.approvals.length || projection.questions.length ? "waiting" : "running"
            : projection.terminalState ? "ready" : this.state.phase;
          this.patch({
            projection,
            phase,
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

  private async closeActiveSession(removePersistence: boolean) {
    const sessionId = this.state.session?.id;
    const bridge = this.bridgeProvider();
    if (!sessionId || !bridge?.closeAgentSession) return;
    await bridge.closeAgentSession({ rootPath: this.workspaceRoot, sessionId, removePersistence });
  }

  private patch(patch: Partial<AgentControllerState>) {
    if (patch.phase && patch.phase !== this.state.phase && !agentControllerTransitions[this.state.phase].includes(patch.phase)) {
      throw new Error(`Invalid Agent controller transition: ${this.state.phase} -> ${patch.phase}`);
    }
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private requireBridge<K extends keyof AgentBridge>(...methods: K[]): AgentBridge {
    const bridge = this.bridgeProvider();
    if (!bridge || methods.some((method) => typeof bridge[method] !== "function")) {
      throw new Error("Desktop Agent bridge unavailable. Restart PuppyOne so the native bridge can load.");
    }
    return bridge;
  }

  private uiKey() {
    return this.state.session?.id || `${this.workspaceRoot}:new`;
  }

  private readSessionUi(key: string): SessionUiState {
    return this.sessionUi.get(key) ?? { draft: "", scrollTop: 0, measurements: {}, pinned: true };
  }

  private writeCurrentSessionUi(value: Partial<SessionUiState>) {
    const key = this.uiKey();
    this.sessionUi.set(key, { ...this.readSessionUi(key), ...value });
  }

  private saveSessionUi() {
    this.writeCurrentSessionUi({ draft: this.state.draft });
  }

  private restoreSessionUi() {
    const ui = this.readSessionUi(this.uiKey());
    this.patch({ draft: ui.draft });
  }
}

function chooseModel(inspection: AgentProviderInspection | null, current: string | null) {
  if (!inspection) return current;
  if (current && inspection.models.some((model) => model.model === current)) return current;
  return inspection.models.find((model) => model.isDefault)?.model || inspection.models[0]?.model || null;
}

function chooseMode(inspection: AgentProviderInspection | null, current: string | null) {
  const modes = inspection?.modes ?? [];
  if (current && modes.some((mode) => mode.id === current)) return current;
  return modes.find((mode) => mode.isDefault)?.id || modes[0]?.id || null;
}

function mergeReferences(current: AgentFileReference[], incoming: AgentFileReference[]) {
  const byPath = new Map(current.map((entry) => [entry.path, entry]));
  for (const entry of incoming) if (entry?.path) byPath.set(entry.path, entry);
  return Array.from(byPath.values()).slice(0, 32);
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

export function formatAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No handler registered for 'agent:")) {
    return "Desktop Agent runtime was updated. Restart PuppyOne once so the native bridge can load.";
  }
  return message;
}
