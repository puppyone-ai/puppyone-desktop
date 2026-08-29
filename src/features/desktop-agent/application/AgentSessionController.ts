import { applyAgentEvents, createAgentProjection } from "../domain/agent-projection";
import {
  agentProviderIdForModel,
  chooseAgentModel,
  chooseAgentProvider,
  listAgentInferenceProviders,
} from "../domain/agent-provider-routing";
import type {
  AgentApprovalDecision,
  AgentQuestionResolution,
  AgentSessionSnapshot,
} from "../domain/agent-contract";
import { AgentEventSynchronizer } from "./AgentEventSynchronizer";
import { agentControllerTransitions, type AgentControllerState } from "./agent-controller-state";
import { AgentKnownError, formatAgentError } from "./agent-error";
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
import { chooseAgentMode } from "./agent-controller-values";
import { AgentReferenceDraftManager } from "./AgentReferenceDraftManager";
import {
  AgentTurnSubmissionCoordinator,
  agentTurnSubmissionLimits,
} from "./AgentTurnSubmissionCoordinator";

export type { AgentControllerPhase, AgentControllerState } from "./agent-controller-state";
export { agentControllerTransitions } from "./agent-controller-state";
export { formatAgentError } from "./agent-error";

type Listener = () => void;

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
  private readonly referenceDrafts: AgentReferenceDraftManager;
  private readonly submission: AgentTurnSubmissionCoordinator;
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
      pendingIntent: null,
      sessionPreparation: "idle",
      references: [],
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
    this.referenceDrafts = new AgentReferenceDraftManager({
      workspaceRoot,
      bridgeProvider,
      readState: this.getSnapshot,
      patch: (patch) => this.patch(patch),
      appendText: (text) => this.appendDroppedText(text),
    });
    this.submission = new AgentTurnSubmissionCoordinator({
      workspaceRoot,
      bridgeProvider,
      references: this.referenceDrafts,
      readState: this.getSnapshot,
      patch: (patch) => this.patch(patch),
      writeDraft: (draft) => this.writeCurrentSessionUi({ draft }),
      prepareSession: () => this.prepareSession(),
    });
    this.eventSynchronizer = new AgentEventSynchronizer(
      workspaceRoot,
      bridgeProvider,
      this.getSnapshot,
      (patch) => this.patch(patch),
      this.submission.drainQueuedIntent,
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

  /** Releases renderer subscriptions only; it never sends a runtime stop. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.sessionPreparer.dispose();
    this.eventSynchronizer.dispose();
    this.localConnectionLoader.dispose();
    this.sessionUi.clear();
    void this.referenceDrafts.revoke([
      ...this.state.references,
      ...this.submission.ownedReferences(),
      ...(this.state.pendingIntent?.references ?? []),
    ]);
    this.submission.clearQueue();
    this.referenceDrafts.clearRetryMaterial();
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
    await this.referenceDrafts.rotate([
      ...this.state.references,
      ...this.submission.ownedReferences(),
    ]);
    this.submission.clearQueue();
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
    const bridge = this.requireBridge("discoverAgentRuntimes", "resumeAgentSession");
    this.patch({ phase: "discovering", error: null });
    try {
      const inspection = await bridge.discoverAgentRuntimes({
        rootPath: this.workspaceRoot,
        runtimeId: this.state.selectedRuntimeId,
        refresh,
      });
      this.lastInspectionAt = Date.now();
      const runtimeId = inspection.selectedRuntimeId
        || null;
      const selectedModel = chooseAgentModel(inspection, this.state.selectedModel, null);
      const selectedModelEntry = inspection.models.find((model) => model.model === selectedModel);
      const selectedProviderId = agentProviderIdForModel(selectedModelEntry)
        || chooseAgentProvider(inspection, this.state.selectedProviderId, selectedModel);
      const selectedMode = chooseAgentMode(inspection, this.state.selectedMode);
      this.patch({ inspection, selectedRuntimeId: runtimeId, selectedProviderId, selectedModel, selectedMode, initialized: true });
      if (!runtimeId || !inspection.readiness || inspection.readiness.status !== "ready") {
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

  async addWorkspacePaths(paths: string[]) {
    return this.referenceDrafts.addWorkspacePaths(paths);
  }

  async pickWorkspaceReferences() {
    return this.referenceDrafts.pickWorkspaceReferences();
  }

  async addPathTextOrDraft(text: string) {
    return this.referenceDrafts.addPathTextOrDraft(text);
  }

  async stageExternalFiles(files: File[]) {
    return this.referenceDrafts.stageExternalFiles(files);
  }

  removeReference(id: string) {
    this.referenceDrafts.remove(id);
  }

  retryReference(id: string) {
    this.referenceDrafts.retry(id);
  }

  appendDroppedText(text: string) {
    const value = text.trim();
    if (!value) return;
    const draft = this.state.draft ? `${this.state.draft}\n${value}` : value;
    this.setDraft(draft);
  }

  rememberViewport(scrollTop: number, measurements: Record<string, number> = {}, pinned = true) {
    this.writeCurrentSessionUi({ scrollTop, measurements, pinned });
  }

  readViewport() {
    return this.readSessionUi(this.uiKey());
  }

  async newSession() {
    if (this.state.projection.runningTurnId) return this.sessionLifecycle.newSession();
    await this.referenceDrafts.reset([
      ...this.state.references,
      ...this.submission.ownedReferences(),
      ...(this.state.pendingIntent?.references ?? []),
    ]);
    this.submission.clearQueue();
    return this.sessionLifecycle.newSession();
  }

  prepareSession() {
    return this.sessionPreparer.prepare();
  }

  async submit(prompt: string) {
    return this.submission.submit(prompt);
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
  maxQueuedPrompts: agentTurnSubmissionLimits.maxQueuedPrompts,
});
