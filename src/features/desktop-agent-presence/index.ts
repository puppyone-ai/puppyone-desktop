import { AgentActivityStore } from "./application/agentActivityStore";
import { electronAgentActivityClient } from "./infrastructure/electron/electronAgentActivityClient";

export { AgentFilePresence } from "./ui/AgentFilePresence";
export { toWorkspaceRelativePath } from "./domain/agentActivity";
export type {
  AgentFilePresenceClaim,
  AgentFilePresenceProjection,
} from "./domain/agentActivity";

export const desktopAgentActivityStore = new AgentActivityStore(electronAgentActivityClient);
