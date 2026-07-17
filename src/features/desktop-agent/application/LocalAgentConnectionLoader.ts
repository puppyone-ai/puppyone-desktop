import type { AgentControllerState } from "./agent-controller-state";
import { createAgentError, formatAgentError } from "./agent-error";
import type { AgentClientProvider } from "./AgentClientPort";

type StatePatch = (patch: Partial<AgentControllerState>) => void;

/**
 * Lazy presentation loader for the main-owned local-tool inventory.
 * It does not participate in session phases and cannot select a Provider.
 */
export class LocalAgentConnectionLoader {
  private pending: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly workspaceRoot: string,
    private readonly bridgeProvider: AgentClientProvider,
    private readonly patch: StatePatch,
  ) {}

  discover(refresh = false) {
    if (this.disposed) return Promise.resolve();
    if (this.pending) return this.pending;
    const bridge = this.bridgeProvider();
    if (!bridge?.discoverLocalAgentConnections) {
      this.patch({
        localConnectionsPhase: "error",
        localConnectionsError: createAgentError("native-bridge-unavailable"),
      });
      return Promise.resolve();
    }
    this.patch({ localConnectionsPhase: "loading", localConnectionsError: null });
    const task = bridge.discoverLocalAgentConnections({ rootPath: this.workspaceRoot, refresh })
      .then((snapshot) => {
        if (this.disposed) return;
        this.patch({
          localConnections: snapshot.connections,
          localConnectionsPhase: "ready",
          localConnectionsScannedAt: snapshot.scannedAt,
          localConnectionsError: snapshot.warnings[0]
            ? { code: "unknown", detail: snapshot.warnings[0] }
            : null,
        });
      })
      .catch((error) => {
        if (this.disposed) return;
        this.patch({
          localConnectionsPhase: "error",
          localConnectionsError: formatAgentError(error),
        });
      })
      .finally(() => {
        if (this.pending === task) this.pending = null;
      });
    this.pending = task;
    return task;
  }

  dispose() {
    this.disposed = true;
  }
}
