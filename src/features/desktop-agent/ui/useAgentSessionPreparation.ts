import { useEffect } from "react";
import type { AgentControllerState } from "../application/agent-controller-state";
import type { AgentSessionController } from "../application/AgentSessionController";

/** Prepares an empty native session only while the active panel is routable. */
export function useAgentSessionPreparation(
  controller: AgentSessionController,
  state: AgentControllerState,
  enabled: boolean,
) {
  useEffect(() => {
    if (
      !enabled
      || !state.initialized
      || state.phase !== "ready"
      || state.session
      || state.sessionPreparation !== "idle"
    ) return;
    void controller.prepareSession();
  }, [controller, enabled, state.initialized, state.phase, state.session, state.sessionPreparation]);
}
