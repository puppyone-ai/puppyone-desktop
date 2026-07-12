import { AgentRuntimeHost, AgentRuntimeRegistry } from "../runtime/agent-runtime-registry.mjs";
import { createClaudeRuntimeDefinition } from "../runtimes/claude/claude-runtime-definition.mjs";
import { createCodexRuntimeDefinition } from "../runtimes/codex/codex-runtime-definition.mjs";
import { createCursorRuntimeDefinition } from "../runtimes/cursor/cursor-runtime-definition.mjs";
import { createOpenCodeNativeRuntimeDefinition } from "../runtimes/opencode-native/opencode-native-runtime-definition.mjs";
import { createPuppyOneAgentRuntimeDefinition } from "../runtimes/puppyone-agent/puppyone-agent-runtime-definition.mjs";

export const DEFAULT_AGENT_RUNTIME_ID = "puppyone-agent";

/** The only production composition root that imports concrete Agent runtimes. */
export function createDefaultAgentRuntimeHost({
  appPath = null,
  resourcesPath = process.resourcesPath,
  logger = console,
  appVersion = "0.0.0",
  managedOpenCodeConfigDir = null,
  allowExternalOpenCode = false,
  openCode = {},
  codex = {},
  claude = {},
  cursor = {},
  openCodeNative = {},
} = {}) {
  const definitions = [
    createPuppyOneAgentRuntimeDefinition({
      appPath,
      resourcesPath,
      managedConfigDir: managedOpenCodeConfigDir,
      allowExternal: allowExternalOpenCode,
      appVersion,
      logger,
      ...openCode,
    }),
    createCodexRuntimeDefinition({ appVersion, ...codex }),
    createClaudeRuntimeDefinition({ appVersion, logger, ...claude }),
    createOpenCodeNativeRuntimeDefinition({ appVersion, logger, ...openCodeNative }),
    createCursorRuntimeDefinition(cursor),
  ];
  return new AgentRuntimeHost(new AgentRuntimeRegistry(definitions, {
    defaultRuntimeId: DEFAULT_AGENT_RUNTIME_ID,
  }));
}
