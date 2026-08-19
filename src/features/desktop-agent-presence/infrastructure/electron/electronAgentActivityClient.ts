import type { AgentActivityClient } from "../../application/agentActivityClient";
import type { AgentActivityEvent, AgentActivitySnapshot } from "../../../../../shared/agent-activity-contract/types";

export const electronAgentActivityClient: AgentActivityClient = {
  subscribe: async (): Promise<AgentActivitySnapshot> => window.puppyoneDesktop?.subscribeAgentActivity?.() ?? {
    schemaVersion: 1 as const,
    activities: [] as const,
  },
  onEvent(listener: (event: AgentActivityEvent) => void) {
    return window.puppyoneDesktop?.onAgentActivityEvent?.(listener) ?? (() => undefined);
  },
  unsubscribe() {
    window.puppyoneDesktop?.unsubscribeAgentActivity?.();
  },
};
