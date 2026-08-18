import { claudeActivityAdapter } from "./adapters/claude/descriptor.mjs";
import { codexActivityAdapter } from "./adapters/codex/descriptor.mjs";
import { cursorActivityAdapter } from "./adapters/cursor/descriptor.mjs";
import { hermesActivityAdapter } from "./adapters/hermes/descriptor.mjs";
import { openCodeActivityAdapter } from "./adapters/opencode/descriptor.mjs";
import { piActivityAdapter } from "./adapters/pi/descriptor.mjs";
import { assertTerminalAgentActivityAdapter } from "./terminal-agent-activity-adapter-port.mjs";

const DEFAULT_ADAPTERS = Object.freeze([
  codexActivityAdapter,
  claudeActivityAdapter,
  cursorActivityAdapter,
  openCodeActivityAdapter,
  piActivityAdapter,
  hermesActivityAdapter,
]);

export function createTerminalAgentActivityAdapterRegistry(adapters = DEFAULT_ADAPTERS) {
  const byProviderId = new Map();
  for (const candidate of adapters) {
    const adapter = assertTerminalAgentActivityAdapter(candidate);
    if (byProviderId.has(adapter.providerId)) {
      throw new Error(`Duplicate Terminal Agent activity adapter: ${adapter.providerId}`);
    }
    byProviderId.set(adapter.providerId, Object.freeze(adapter));
  }
  return Object.freeze({
    get: (providerId) => byProviderId.get(providerId) ?? null,
    list: () => Array.from(byProviderId.values()),
  });
}
