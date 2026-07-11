import { applyAgentEvents, createAgentProjection } from "../domain/agent-projection";
import {
  agentProviderIdForModel,
  chooseAgentModel,
  chooseAgentProvider,
  listAgentInferenceProviders,
} from "../domain/agent-provider-routing";
import type {
  AgentApprovalDecision,
  AgentFileReference,
  AgentProviderInspection,
  AgentQuestionResolution,
  AgentSessionSnapshot,
} from "../domain/agent-contract";
import { AgentEventSynchronizer } from "./AgentEventSynchronizer";
import {
  agentControllerTransitions,
  type AgentControllerState,
} from "./agent-controller-state";
import { formatAgentError } from "./agent-error";
import { SessionUiStateStore, type SessionUiState } from "./SessionUiStateStore";
import { LocalAgentConnectionLoader } from "./LocalAgentConnectionLoader";
import type { AgentClientPort, AgentClientProvider } from "./AgentClientPort";
import { AgentSessionLifecycle, agentSessionLifecycleLimits } from "./AgentSessionLifecycle";

export type { AgentControllerPhase, AgentControllerState } from "./agent-controller-state";
export { agentControllerTransitions } from "./agent-controller-state";
export { formatAgentError } from "./agent-error";

type Listener = () => void;

const MAX_QUEUED_PROMPTS = 20;

export class AgentSessionController {
  readonly workspaceRoot: string;
  private state: AgentControllerState;
  private listeners = new Set<Listener>();
  private readonly eventSynchronizer: AgentEventSynchronizer;
  private initializePromise: Promise<void> | null = null;
  private readonly sessionUi = new SessionUiStateStore();
  private readonly localConnectionLoader: LocalAgentConnectionLoader;
  private readonly sessionLifecycle: AgentSessionLifecycle;
  private queuedPrompts: string[] = [];
  private disposed = false;

  constructor(workspaceRoot: string, private readonly bridgeProvider: AgentClientProvider) {
    this.workspaceRoot = workspaceRoot;
    this.state = {
      phase: "idle",
      inspection: null,
      session: null,
      history: [],
      projection: createAgentProjection(),
      selectedRuntimeId: null,
      selectedProviderId: null,
      selectedModel: null,
      selectedMode: null,
      localConnections: [],
      localConnectionsPhase: "idle",
      localConnectionsScannedAt: null,
      localConnectionsError: null,
      draft: "",
      attachments: [],
      contextReferences: [],
      error: null,
      submitting: false,
      stopping: false,
      resolvingBlocker: false,
      initialized: false,
    };
    this.localConnectionLoader = new LocalAgentConnectionLoader(
      workspaceRoot,
      bridgeProvider,
      (patch) => this.patch(patch),
    );
    this.eventSynchronizer = new AgentEventSynchronizer(
      workspaceRoot,
      bridgeProvider,
      this.getSnapshot,
      (patch) => this.patch(patch),
      this.drainQueuedPrompt,
    );
    this.sessionLifecycle = new AgentSessionLifecycle({
      workspaceRoot,
      bridgeProvider,
      readState: this.getSnapshot,
      patch: (patch) => this.patch(patch),
      createSession: () => this.createSession(),
      applySnapshot: (snapshot) => this.applySnapshot(snapshot),
      saveSessionUi: () => this.saveSessionUi(),
      restoreSessionUi: () => this.restoreSessionUi(),
      deleteSessionUi: (sessionId) => this.sessionUi.delete(sessionId),
    });
    this.eventSynchronizer.connect();
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
    if (this.disposed) return;
    this.disposed = true;
    this.eventSynchronizer.dispose();
    this.localConnectionLoader.dispose();
    this.sessionUi.clear();
    this.queuedPrompts = [];
    this.listeners.clear();
  }

  async initialize(refresh = false) {
    if (this.initializePromise && !refresh) return this.initializePromise;
    this.initializePromise = this.runInitialize(refresh).finally(() => { this.initializePromise = null; });
    return this.initializePromise;
  }

  async discoverLocalConnections(refresh = false) {
    return this.localConnectionLoader.discover(refresh);
  }

  private async runInitialize(refresh: boolean) {
    this.eventSynchronizer.connect();
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
      const selectedProviderId = chooseAgentProvider(inspection, this.state.selectedProviderId, this.state.selectedModel);
      const selectedModel = chooseAgentModel(inspection, this.state.selectedModel, selectedProviderId);
      const selectedMode = chooseMode(inspection, this.state.selectedMode);
      this.patch({ inspection, selectedRuntimeId: runtimeId, selectedProviderId, selectedModel, selectedMode, initialized: true });
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

  selectProvider(providerId: string | null) {
    if (this.state.projection.runningTurnId) return this.state.selectedModel;
    const selectedProviderId = providerId && listAgentInferenceProviders(this.state.inspection).some((provider) => provider.id === providerId)
      ? providerId
      : null;
    const selectedModel = chooseAgentModel(this.state.inspection, null, selectedProviderId);
    this.patch({ selectedProviderId, selectedModel, error: null });
    return selectedModel;
  }

  selectModel(model: string | null) {
    if (this.state.projection.runningTurnId) return;
    const selectedModel = model && this.state.inspection?.models.some((candidate) => candidate.model === model)
      ? model
      : null;
    this.patch({
      selectedProviderId: selectedModel ? agentProviderIdForModel(selectedModel) : this.state.selectedProviderId,
      selectedModel,
      error: null,
    });
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

  newSession() {
    return this.sessionLifecycle.newSession();
  }

  switchSession(sessionId: string) {
    return this.sessionLifecycle.switchSession(sessionId);
  }

  async submit(prompt: string) {
    const bridge = this.requireBridge("startAgentTurn");
    const text = prompt.trim();
    if (!text || this.state.submitting) return false;
    if (!this.state.selectedProviderId || !this.state.selectedModel) {
      this.patch({ error: "Choose a connected model provider and model before sending a message." });
      return false;
    }
    const activeTurnId = this.state.projection.runningTurnId;
    if (activeTurnId && this.state.session && this.state.inspection?.capabilities?.steer && bridge.steerAgentTurn) {
      await bridge.steerAgentTurn({ rootPath: this.workspaceRoot, sessionId: this.state.session.id, turnId: activeTurnId, message: text });
      this.patch({ draft: "" });
      return true;
    }
    if (activeTurnId && this.state.inspection?.capabilities?.queue) {
      if (this.queuedPrompts.length >= MAX_QUEUED_PROMPTS) {
        this.patch({ error: `The Agent prompt queue is full (${MAX_QUEUED_PROMPTS}). Wait for the active turn to finish.` });
        return false;
      }
      this.queuedPrompts.push(text);
      this.patch({ draft: "", error: null });
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
      await this.eventSynchronizer.repairFrom(this.state.projection.lastSequence);
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
      await this.eventSynchronizer.repairFrom(this.state.projection.lastSequence);
    } finally {
      this.patch({ resolvingBlocker: false });
    }
  }

  forkSession() {
    return this.sessionLifecycle.forkSession();
  }

  archiveSession(sessionId = this.state.session?.id) {
    return this.sessionLifecycle.archiveSession(sessionId);
  }

  deleteSession(sessionId = this.state.session?.id) {
    return this.sessionLifecycle.deleteSession(sessionId);
  }

  compactSession() {
    return this.sessionLifecycle.compactSession();
  }

  refreshHistory() {
    return this.sessionLifecycle.refreshHistory();
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
    this.eventSynchronizer.flush();
    const inspection = this.state.inspection ? {
      ...this.state.inspection,
      runtime: snapshot.runtime ?? snapshot.session.runtime ?? this.state.inspection.runtime,
      account: snapshot.account,
      providers: snapshot.providers ?? this.state.inspection.providers ?? [],
      models: snapshot.models,
      modes: snapshot.modes ?? this.state.inspection.modes ?? [],
      commands: snapshot.commands ?? this.state.inspection.commands ?? [],
      capabilities: snapshot.capabilities,
    } : null;
    const selectedModel = snapshot.session.selectedModel
      || this.state.selectedModel
      || chooseAgentModel(inspection, null, this.state.selectedProviderId);
    const selectedProviderId = chooseAgentProvider(inspection, this.state.selectedProviderId, selectedModel);
    this.patch({
      session: snapshot.session,
      inspection,
      selectedRuntimeId: snapshot.session.runtimeId || snapshot.session.provider || this.state.selectedRuntimeId,
      selectedProviderId,
      selectedModel: chooseAgentModel(inspection, selectedModel, selectedProviderId),
      selectedMode: snapshot.session.selectedMode || this.state.selectedMode || chooseMode(inspection, null),
      projection: applyAgentEvents(createAgentProjection({ partialHistory: snapshot.partial }), snapshot.events, { partialHistory: snapshot.partial }),
      stopping: false,
    });
  }

  private drainQueuedPrompt = () => {
    if (this.state.projection.runningTurnId || this.queuedPrompts.length === 0) return;
    const prompt = this.queuedPrompts.shift();
    if (prompt) queueMicrotask(() => { void this.submit(prompt); });
  };

  private patch(patch: Partial<AgentControllerState>) {
    if (this.disposed) return;
    if (patch.phase && patch.phase !== this.state.phase && !agentControllerTransitions[this.state.phase].includes(patch.phase)) {
      throw new Error(`Invalid Agent controller transition: ${this.state.phase} -> ${patch.phase}`);
    }
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private requireBridge<K extends keyof AgentClientPort>(...methods: K[]): AgentClientPort {
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
    return this.sessionUi.read(key);
  }

  private writeCurrentSessionUi(value: Partial<SessionUiState>) {
    const key = this.uiKey();
    this.sessionUi.patch(key, value);
  }

  private saveSessionUi() {
    this.writeCurrentSessionUi({ draft: this.state.draft });
  }

  private restoreSessionUi() {
    const ui = this.readSessionUi(this.uiKey());
    this.patch({ draft: ui.draft });
  }
}

export const agentSessionControllerLimits = Object.freeze({
  maxCachedSessions: agentSessionLifecycleLimits.maxCachedSessions,
  maxQueuedPrompts: MAX_QUEUED_PROMPTS,
});

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
