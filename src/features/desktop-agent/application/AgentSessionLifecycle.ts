import { createAgentProjection } from "../domain/agent-projection";
import type { AgentSessionSnapshot } from "../domain/agent-contract";
import type { AgentClientPort, AgentClientProvider } from "./AgentClientPort";
import type { AgentControllerState } from "./agent-controller-state";
import { AgentKnownError, createAgentError, formatAgentError } from "./agent-error";

type StatePatch = (patch: Partial<AgentControllerState>) => void;

type AgentSessionLifecycleOptions = {
  workspaceRoot: string;
  bridgeProvider: AgentClientProvider;
  readState: () => AgentControllerState;
  patch: StatePatch;
  createSession: () => Promise<AgentSessionSnapshot>;
  applySnapshot: (snapshot: AgentSessionSnapshot) => void;
  deleteSessionUi: (sessionId: string) => void;
};

/** Owns the current live session only; PuppyOne does not own Chat History. */
export class AgentSessionLifecycle {
  constructor(private readonly options: AgentSessionLifecycleOptions) {}

  async newSession() {
    const state = this.options.readState();
    if (state.projection.runningTurnId) {
      this.options.patch({ error: createAgentError("active-turn") });
      return;
    }
    const previousSessionId = state.session?.id ?? null;
    try {
      await this.closeActiveSession(true);
      if (previousSessionId) this.options.deleteSessionUi(previousSessionId);
      this.options.patch({
        phase: "creating",
        session: null,
        projection: createAgentProjection(),
        error: null,
        pendingPrompt: null,
        sessionPreparation: "preparing",
        submitting: false,
        attachments: [],
        contextReferences: [],
      });
      const snapshot = await this.options.createSession();
      this.options.applySnapshot(snapshot);
      this.options.patch({ phase: "ready" });
    } catch (error) {
      this.options.patch({
        phase: "failed",
        error: formatAgentError(error),
        sessionPreparation: "failed",
      });
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

  private async closeActiveSession(removePersistence: boolean) {
    const sessionId = this.options.readState().session?.id;
    const bridge = this.options.bridgeProvider();
    if (!sessionId || !bridge?.closeAgentSession) return;
    await bridge.closeAgentSession({ rootPath: this.options.workspaceRoot, sessionId, removePersistence });
  }

  private requireBridge<K extends keyof AgentClientPort>(...methods: K[]): AgentClientPort {
    const bridge = this.options.bridgeProvider();
    if (!bridge || methods.some((method) => typeof bridge[method] !== "function")) {
      throw new AgentKnownError("native-bridge-unavailable");
    }
    return bridge;
  }
}
