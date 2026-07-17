// Legacy import edge. Production composition imports the accurately named
// process-local cache module directly; no durable Chat History is implemented.
import {
  agentSessionCachePolicy,
  createEphemeralAgentSessionCache,
} from "./cache/ephemeral-agent-session-cache.mjs";

export { agentSessionCachePolicy, createEphemeralAgentSessionCache };

/** @deprecated Use createEphemeralAgentSessionCache. */
export const createAgentPersistence = createEphemeralAgentSessionCache;

/** @deprecated Use agentSessionCachePolicy. */
export const agentPersistenceLimits = agentSessionCachePolicy;
