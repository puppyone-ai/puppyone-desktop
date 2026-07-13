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
  AgentQuestionResolution,
  AgentSessionSnapshot,
} from "../domain/agent-contract";
import { AgentEventSynchronizer } from "./AgentEventSynchronizer";
import { agentControllerTransitions, type AgentControllerState } from "./agent-controller-state";
import { AgentKnownError, createAgentError, formatAgentError } from "./agent-error";
import { SessionUiStateStore, type SessionUiState } from "./SessionUiStateStore";
import { LocalAgentConnectionLoader } from "./LocalAgentConnectionLoader";
import type { AgentClientPort, AgentClientProvider } from "./AgentClientPort";
import { AgentSessionLifecycle } from "./AgentSessionLifecycle";
import { AgentSessionPreparer } from "./AgentSessionPreparer";
import {
  AGENT_RUNTIME_DISCOVERY_CACHE_TTL_MS,
  hasFreshAgentRuntimeInspection,
} from "./agent-runtime-discovery-cache";
import { planAgentRuntimeSwitch } from "./agent-runtime-selection";
import { chooseAgentMode, mergeAgentReferences } from "./agent-controller-values";

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
  private readonly sessionPreparer: AgentSessionPreparer;
  private queuedPrompts: string[] = [];
  private lastInspectionAt = 0;
  private disposed = false;

  constructor(workspaceRoot: string, private readonly bridgeProvider: AgentClientProvider) {
    this.workspaceRoot = workspaceRoot;
    this.state = {
      phase: "idle",
      inspection: null,
      session: null,
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
      pendingPrompt: null,
      sessionPreparation: "idle",
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
      deleteSessionUi: (sessionId) => this.sessionUi.delete(sessionId),
    });
    this.sessionPreparer = new AgentSessionPreparer({
      workspaceRoot,
      bridgeProvider,
      readState: this.getSnapshot,
      patch: (patch) => this.patch(patch),
      createSession: () => this.createSession(),
      applySnapshot: (snapshot) => this.applySnapshot(snapshot),
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

  setInitialRuntimePreference(runtimeId: string | null) {
    if (this.state.initialized || this.state.phase !== "idle" || this.state.selectedRuntimeId) return;
    if (!runtimeId || !/^[a-z][a-z0-9-]{1,39}$/.test(runtimeId)) return;
    this.patch({ selectedRuntimeId: runtimeId });
  }

  /** Releases renderer subscriptions only; it never sends a runtime stop. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.sessionPreparer.dispose();
    this.eventSynchronizer.dispose();
    this.localConnectionLoader.dispose();
    this.sessionUi.clear();
    this.queuedPrompts = [];
    this.listeners.clear();
  }

  async initialize(refresh = false) {
    if (this.initializePromise) return this.initializePromise;
    if (!refresh && hasFreshAgentRuntimeInspection(this.state, this.lastInspectionAt)) return;
    this.initializePromise = this.runInitialize(refresh).finally(() => { this.initializePromise = null; });
    return this.initializePromise;
  }

  async discoverLocalConnections(refresh = false) {
    return this.localConnectionLoader.discover(refresh);
  }

  async selectRuntime(runtimeId: string) {
    const plan = planAgentRuntimeSwitch(this.state, runtimeId);
    if (!plan) return false;
    if (plan.alreadySelected) return true;
    this.patch(plan.patch);
    try {
      if (plan.sessionId) {
        await this.requireBridge("closeAgentSession").closeAgentSession({
          rootPath: this.workspaceRoot,
          sessionId: plan.sessionId,
          removePersistence: true,
        });
        this.sessionUi.delete(plan.sessionId);
      }
      await this.initialize(false);
      return this.state.selectedRuntimeId === runtimeId;
    } catch (error) {
      this.patch({ phase: "failed", error: formatAgentError(error) });
      return false;
    }
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
      this.lastInspectionAt = Date.now();
      const runtimeId = inspection.selectedRuntimeId
        || inspection.runtime?.id
        || inspection.readiness.runtimeId
        || inspection.readiness.provider
        || null;
      const selectedModel = chooseAgentModel(inspection, this.state.selectedModel, null);
      const selectedModelEntry = inspection.models.find((model) => model.model === selectedModel);
      const selectedProviderId = agentProviderIdForModel(selectedModelEntry)
        || chooseAgentProvider(inspection, this.state.selectedProviderId, selectedModel);
      const selectedMode = chooseAgentMode(inspection, this.state.selectedMode);
      this.patch({ inspection, selectedRuntimeId: runtimeId, selectedProviderId, selectedModel, selectedMode, initialized: true });
      if (inspection.readiness.status !== "ready") {
        this.patch({ phase: "ready", sessionPreparation: "idle" });
        return;
      }
      this.patch({ phase: "restoring" });
      const restored = await bridge.resumeAgentSession({ rootPath: this.workspaceRoot, runtimeId });
      if (restored) this.applySnapshot(restored);
      this.patch({
        phase: restored?.session.activeTurnId ? "running" : "ready",
        sessionPreparation: restored ? "ready" : "idle",
      });
    } catch (error) {
      this.patch({
        phase: "failed",
        error: formatAgentError(error),
        initialized: true,
        sessionPreparation: "failed",
      });
    }
  }

  selectProvider(providerId: string | null) {
    if (this.state.projection.runningTurnId || this.state.sessionPreparation === "preparing" || this.state.pendingPrompt) return this.state.selectedModel;
    const selectedProviderId = providerId && listAgentInferenceProviders(this.state.inspection).some((provider) => provider.id === providerId)
      ? providerId
      : null;
    const selectedModel = chooseAgentModel(this.state.inspection, null, selectedProviderId);
    this.patch({ selectedProviderId, selectedModel, error: null });
    return selectedModel;
  }

  selectModel(model: string | null) {
    if (this.state.projection.runningTurnId || this.state.sessionPreparation === "preparing" || this.state.pendingPrompt) return;
    const selectedModelEntry = model
      ? this.state.inspection?.models.find((candidate) => candidate.model === model) ?? null
      : null;
    const selectedModel = selectedModelEntry?.model ?? null;
    this.patch({
      selectedProviderId: selectedModelEntry ? agentProviderIdForModel(selectedModelEntry) : this.state.selectedProviderId,
      selectedModel,
      error: null,
    });
  }

  selectMode(mode: string | null) {
    if (this.state.sessionPreparation === "preparing" || this.state.pendingPrompt) return;
    this.patch({ selectedMode: mode || null });
  }

  setDraft(draft: string) {
    this.patch({ draft });
    this.writeCurrentSessionUi({ draft });
  }

  addAttachments(references: AgentFileReference[]) {
    this.patch({ attachments: mergeAgentReferences(this.state.attachments, references) });
  }

  removeAttachment(path: string) {
    this.patch({ attachments: this.state.attachments.filter((entry) => entry.path !== path) });
  }

  addContextReferences(references: AgentFileReference[]) {
    this.patch({ contextReferences: mergeAgentReferences(this.state.contextReferences, references) });
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

  prepareSession() {
    return this.sessionPreparer.prepare();
  }

  async submit(prompt: string) {
    const bridge = this.requireBridge("startAgentTurn");
    const text = prompt.trim();
    if (!text || this.state.submitting || this.state.pendingPrompt) return false;
    if (this.state.inspection?.capabilities?.modelSelection && !this.state.selectedModel) {
      this.patch({ error: createAgentError("model-required") });
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
        this.patch({ error: createAgentError("prompt-queue-full", { limit: MAX_QUEUED_PROMPTS }) });
        return false;
      }
      this.queuedPrompts.push(text);
      this.patch({ draft: "", error: null });
      return true;
    }
    if (activeTurnId) return false;
    this.patch({
      submitting: true,
      pendingPrompt: text,
      draft: "",
      error: null,
    });
    this.writeCurrentSessionUi({ draft: "" });
    try {
      let session = this.state.session;
      if (!session) {
        const prepared = await this.prepareSession();
        session = this.state.session;
        if (!prepared || !session) {
          const preparationError = this.state.error ?? createAgentError("session-prepare-failed");
          this.patch({
            pendingPrompt: null,
            draft: this.state.draft || text,
            error: preparationError,
          });
          this.writeCurrentSessionUi({ draft: this.state.draft || text });
          return false;
        }
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
      this.patch({ attachments: [], contextReferences: [], phase: "running" });
      return true;
    } catch (error) {
      this.patch({
        pendingPrompt: null,
        draft: this.state.draft || text,
        error: formatAgentError(error),
      });
      this.writeCurrentSessionUi({ draft: this.state.draft || text });
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

  compactSession() {
    return this.sessionLifecycle.compactSession();
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
      || chooseAgentModel(inspection, null, null);
    const selectedModelEntry = inspection?.models.find((model) => model.model === selectedModel);
    const selectedProviderId = agentProviderIdForModel(selectedModelEntry)
      || chooseAgentProvider(inspection, this.state.selectedProviderId, selectedModel);
    this.patch({
      session: snapshot.session,
      inspection,
      selectedRuntimeId: snapshot.session.runtimeId || snapshot.session.provider || this.state.selectedRuntimeId,
      selectedProviderId,
      selectedModel: chooseAgentModel(inspection, selectedModel, null),
      selectedMode: snapshot.session.selectedMode || this.state.selectedMode || chooseAgentMode(inspection, null),
      projection: applyAgentEvents(createAgentProjection({ partialHistory: snapshot.partial }), snapshot.events, { partialHistory: snapshot.partial }),
      stopping: false,
      sessionPreparation: "ready",
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
      throw new AgentKnownError("native-bridge-unavailable");
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

}

export const agentSessionControllerLimits = Object.freeze({
  discoveryCacheTtlMs: AGENT_RUNTIME_DISCOVERY_CACHE_TTL_MS,
  maxQueuedPrompts: MAX_QUEUED_PROMPTS,
});
