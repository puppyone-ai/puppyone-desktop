import type { AgentProjection } from "../domain/agent-projection-types";
import type {
  AgentFileReference,
  AgentProviderInspection,
  AgentRuntimeId,
  AgentSessionListItem,
  AgentSessionMetadata,
} from "../domain/agent-contract";

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
  selectedProviderId: string | null;
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
