import type { AgentProjection } from "../domain/agent-projection-types";
import type {
  AgentFileReference,
  AgentLocalConnection,
  AgentProviderInspection,
  AgentRuntimeId,
  AgentSessionMetadata,
} from "../domain/agent-contract";
import type { AgentErrorDescriptor } from "./agent-error";

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

export type AgentSessionPreparation = "idle" | "preparing" | "ready" | "failed";
export type AgentSubmissionStage = "preparing-session" | "starting-turn" | null;

export type AgentControllerState = {
  phase: AgentControllerPhase;
  inspection: AgentProviderInspection | null;
  session: AgentSessionMetadata | null;
  projection: AgentProjection;
  selectedRuntimeId: AgentRuntimeId | null;
  selectedProviderId: string | null;
  selectedModel: string | null;
  selectedMode: string | null;
  localConnections: AgentLocalConnection[];
  localConnectionsPhase: "idle" | "loading" | "ready" | "error";
  localConnectionsScannedAt: string | null;
  localConnectionsError: AgentErrorDescriptor | null;
  draft: string;
  /** Optimistic prompt shown while the native backend accepts the turn. */
  pendingPrompt: string | null;
  /** Lifecycle of the reusable native session prepared for the selected runtime. */
  sessionPreparation: AgentSessionPreparation;
  attachments: AgentFileReference[];
  contextReferences: AgentFileReference[];
  error: AgentErrorDescriptor | null;
  submitting: boolean;
  stopping: boolean;
  resolvingBlocker: boolean;
  initialized: boolean;
};

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

export function phaseForProjection(projection: AgentProjection, current: AgentControllerPhase): AgentControllerPhase {
  if (projection.runningTurnId) {
    return projection.approvals.length || projection.questions.length ? "waiting" : "running";
  }
  return projection.terminalState ? "ready" : current;
}
