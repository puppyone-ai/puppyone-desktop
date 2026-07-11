import { AgentRuntimeHost, AgentRuntimeRegistry } from "../runtime/agent-runtime-registry.mjs";
import { createOpenCodeRuntimeDefinition } from "../runtimes/opencode/opencode-runtime-definition.mjs";

/** The only production composition root that imports concrete Agent runtimes. */
export function createDefaultAgentRuntimeHost({
  appPath = null,
  resourcesPath = process.resourcesPath,
  logger = console,
  managedOpenCodeConfigDir = null,
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
  ];
  return new AgentRuntimeHost(new AgentRuntimeRegistry(definitions));
}
