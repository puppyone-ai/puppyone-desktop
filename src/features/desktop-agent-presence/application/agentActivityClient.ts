import type {
  AgentActivityEvent,
  AgentActivitySnapshot,
} from "../../../../shared/agent-activity-contract/types";

export interface AgentActivityClient {
  subscribe(): Promise<AgentActivitySnapshot>;
  onEvent(listener: (event: AgentActivityEvent) => void): () => void;
  unsubscribe(): void;
}
