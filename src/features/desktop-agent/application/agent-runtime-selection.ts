import { createAgentProjection } from "../domain/agent-projection";
import { listAgentBackends } from "../domain/agent-backend-routing";
import type { AgentControllerState } from "./agent-controller-state";

type AgentRuntimeSwitchPlan = {
  alreadySelected: boolean;
  sessionId: string | null;
  patch: Partial<AgentControllerState>;
};

/** Builds the renderer-only state transition; native session ownership remains behind the client port. */
export function planAgentRuntimeSwitch(
  state: AgentControllerState,
  runtimeId: string,
): AgentRuntimeSwitchPlan | null {
  if (
    state.projection.runningTurnId
    || state.submitting
    || Boolean(state.pendingPrompt)
    || state.sessionPreparation === "preparing"
    || ["discovering", "restoring", "creating"].includes(state.phase)
  ) return null;
  const backend = listAgentBackends(state.inspection)
    .find((entry) => entry.descriptor.id === runtimeId);
  if (!backend) return null;
  if (runtimeId === state.selectedRuntimeId) return { alreadySelected: true, sessionId: state.session?.id ?? null, patch: {} };

  return {
    alreadySelected: false,
    sessionId: state.session?.id ?? null,
    patch: {
      phase: "discovering",
      session: null,
      projection: createAgentProjection(),
      selectedRuntimeId: runtimeId,
      selectedProviderId: null,
      selectedModel: null,
      selectedMode: null,
      draft: "",
      pendingPrompt: null,
      sessionPreparation: "idle",
      attachments: [],
      contextReferences: [],
      error: null,
    },
  };
}
