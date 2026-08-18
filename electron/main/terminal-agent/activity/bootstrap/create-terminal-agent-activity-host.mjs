import path from "node:path";
import { createAgentActivityHost } from "../../../agent-activity/bootstrap/create-agent-activity-host.mjs";
import { createTerminalAgentActivityAdapterRegistry } from "../terminal-agent-activity-adapter-registry.mjs";
import { createTerminalAgentActivityHost } from "../terminal-agent-activity-host.mjs";
import { createAgentActivityBridgeInstaller } from "../registration/bridge-installer.mjs";
import { createHookRegistrationService } from "../registration/hook-registration-service.mjs";

export function createDefaultTerminalAgentActivityHost({
  appPath,
  userDataPath,
  executablePath,
  getWebContents,
  logger = console,
}) {
  const bridgeInstaller = createAgentActivityBridgeInstaller({
    sourceDirectory: path.join(appPath, "electron", "main", "terminal-agent", "activity", "bridge"),
    userDataPath,
    executablePath,
  });
  const registrationService = createHookRegistrationService({ bridgeInstaller });
  const adapterRegistry = createTerminalAgentActivityAdapterRegistry();
  let terminalHost = null;
  const activityHost = createAgentActivityHost({
    userDataPath,
    getWebContents,
    logger,
    onAuthenticatedEnvelope: (envelope) => terminalHost?.handleEnvelope(envelope) ?? false,
  });
  terminalHost = createTerminalAgentActivityHost({
    activityHost,
    adapterRegistry,
    registrationService,
    logger,
  });
  return Object.freeze({
    ...terminalHost,
    subscribe: activityHost.subscribe,
    unsubscribe: activityHost.unsubscribe,
    dispose: activityHost.dispose,
  });
}
