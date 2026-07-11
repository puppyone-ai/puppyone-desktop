import { createCodexRuntimeDefinition } from "../runtimes/codex/codex-runtime-definition.mjs";
import { AgentRuntimeHost, AgentRuntimeRegistry } from "../runtime/agent-runtime-registry.mjs";
import { createOpenCodeRuntimeDefinition } from "../runtimes/opencode/opencode-runtime-definition.mjs";

/** The only production composition root that imports concrete Agent runtimes. */
export function createDefaultAgentRuntimeHost({
  appVersion,
  appPath = null,
  resourcesPath = process.resourcesPath,
  logger = console,
  managedOpenCodeConfigDir = null,
  codex = {},
  openCode = {},
} = {}) {
  const definitions = [
    createOpenCodeRuntimeDefinition({
      appPath,
      resourcesPath,
      managedConfigDir: managedOpenCodeConfigDir,
      logger,
      ...openCode,
    }),
    createCodexRuntimeDefinition({ appVersion, ...codex }),
  ];
  return new AgentRuntimeHost(new AgentRuntimeRegistry(definitions));
}
