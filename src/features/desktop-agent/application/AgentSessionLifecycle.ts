import { createAgentProjection } from "../domain/agent-projection";
import type { AgentSessionSnapshot } from "../domain/agent-contract";
import type { AgentClientPort, AgentClientProvider } from "./AgentClientPort";
import type { AgentControllerState } from "./agent-controller-state";
import { formatAgentError } from "./agent-error";

type StatePatch = (patch: Partial<AgentControllerState>) => void;

type AgentSessionLifecycleOptions = {
  workspaceRoot: string;
  bridgeProvider: AgentClientProvider;
  readState: () => AgentControllerState;
  patch: StatePatch;
  createSession: () => Promise<AgentSessionSnapshot>;
  applySnapshot: (snapshot: AgentSessionSnapshot) => void;
  saveSessionUi: () => void;
  restoreSessionUi: () => void;
  deleteSessionUi: (sessionId: string) => void;
};

const MAX_CACHED_SESSIONS = 100;

/** Owns saved-session lifecycle; live turn/event orchestration remains in the controller. */
export class AgentSessionLifecycle {
  constructor(private readonly options: AgentSessionLifecycleOptions) {}

  async newSession() {
    const state = this.options.readState();
    if (state.projection.runningTurnId) throw new Error("Stop the active turn before starting a new session.");
    this.options.saveSessionUi();
    try {
      await this.closeActiveSession(false);
      this.options.patch({
        phase: "creating",
        session: null,
        projection: createAgentProjection(),
        error: null,
        attachments: [],
        contextReferences: [],
      });
      const snapshot = await this.options.createSession();
      this.options.applySnapshot(snapshot);
      this.options.restoreSessionUi();
      this.options.patch({ phase: "ready" });
      await this.refreshHistory();
    } catch (error) {
      this.options.patch({ phase: "failed", error: formatAgentError(error) });
    }
  }

  async switchSession(sessionId: string) {
    const state = this.options.readState();
    if (!sessionId || sessionId === state.session?.id) return;
    if (state.projection.runningTurnId) throw new Error("Stop the active turn before switching sessions.");
    this.options.saveSessionUi();
    try {
      await this.closeActiveSession(false);
      this.options.patch({ phase: "restoring", session: null, projection: createAgentProjection(), error: null });
      const snapshot = await this.requireBridge("resumeAgentSession").resumeAgentSession({
        rootPath: this.options.workspaceRoot,
        sessionId,
        runtimeId: state.selectedRuntimeId,
      });
      if (!snapshot) throw new Error("The saved Agent session is no longer available.");
      this.options.applySnapshot(snapshot);
      this.options.restoreSessionUi();
      this.options.patch({ phase: snapshot.session.activeTurnId ? "running" : "ready" });
    } catch (error) {
      this.options.patch({ phase: "failed", error: formatAgentError(error) });
    }
  }

  async forkSession() {
    const sessionId = this.options.readState().session?.id;
    if (!sessionId) return;
    this.options.saveSessionUi();
    this.options.patch({ phase: "restoring", error: null });
    try {
      const snapshot = await this.requireBridge("forkAgentSession").forkAgentSession({
        rootPath: this.options.workspaceRoot,
        sessionId,
      });
      this.options.applySnapshot(snapshot);
      this.options.restoreSessionUi();
      this.options.patch({ phase: "ready" });
      await this.refreshHistory();
    } catch (error) {
      this.options.patch({ phase: "failed", error: formatAgentError(error) });
    }
  }

  async archiveSession(sessionId = this.options.readState().session?.id) {
    if (!sessionId) return;
    try {
      await this.requireBridge("archiveAgentSession").archiveAgentSession({
        rootPath: this.options.workspaceRoot,
        sessionId,
        archiveNative: false,
      });
      if (sessionId === this.options.readState().session?.id) {
        this.options.saveSessionUi();
        this.options.patch({ session: null, projection: createAgentProjection(), phase: "ready" });
      }
      await this.refreshHistory();
    } catch (error) {
      this.options.patch({ error: formatAgentError(error) });
    }
  }

  async deleteSession(sessionId = this.options.readState().session?.id) {
    if (!sessionId) return;
    try {
      await this.requireBridge("deleteAgentSession").deleteAgentSession({
        rootPath: this.options.workspaceRoot,
        sessionId,
        deleteNative: false,
      });
      this.options.deleteSessionUi(sessionId);
      if (sessionId === this.options.readState().session?.id) {
        this.options.patch({ session: null, projection: createAgentProjection(), phase: "ready" });
      }
      await this.refreshHistory();
    } catch (error) {
      this.options.patch({ error: formatAgentError(error) });
    }
  }

  async compactSession() {
    const sessionId = this.options.readState().session?.id;
    if (!sessionId) return;
    try {
      await this.requireBridge("compactAgentSession").compactAgentSession({
        rootPath: this.options.workspaceRoot,
        sessionId,
      });
    } catch (error) {
      this.options.patch({ error: formatAgentError(error) });
    }
  }

  async refreshHistory() {
    const bridge = this.options.bridgeProvider();
    if (!bridge?.listAgentSessions) return;
    try {
      const history = await bridge.listAgentSessions({
        rootPath: this.options.workspaceRoot,
        runtimeId: this.options.readState().selectedRuntimeId,
      });
      this.options.patch({ history: history.slice(0, MAX_CACHED_SESSIONS) });
    } catch {
      // History is additive; failure must not take down an otherwise usable chat.
    }
  }

  private async closeActiveSession(removePersistence: boolean) {
    const sessionId = this.options.readState().session?.id;
    const bridge = this.options.bridgeProvider();
    if (!sessionId || !bridge?.closeAgentSession) return;
    await bridge.closeAgentSession({ rootPath: this.options.workspaceRoot, sessionId, removePersistence });
  }

  private requireBridge<K extends keyof AgentClientPort>(...methods: K[]): AgentClientPort {
    const bridge = this.options.bridgeProvider();
    if (!bridge || methods.some((method) => typeof bridge[method] !== "function")) {
      throw new Error("Desktop Agent bridge unavailable. Restart PuppyOne so the native bridge can load.");
    }
    return bridge;
  }
}

export const agentSessionLifecycleLimits = Object.freeze({ maxCachedSessions: MAX_CACHED_SESSIONS });
