import type { AgentLocalConnection } from "../../../../shared/agent-contract/types";
import {
  DESKTOP_TERMINAL_LAUNCHERS,
  type DesktopTerminalLauncherId,
} from "./terminalLaunchers";

const launcherIdByConnectionId = Object.freeze({
  codex: "codex",
  claude: "claude",
  "cursor-agent": "cursor",
  opencode: "opencode",
} satisfies Record<string, Exclude<DesktopTerminalLauncherId, "shell">>);

export type InstalledTerminalAgentId = Exclude<DesktopTerminalLauncherId, "shell">;
export type TerminalAgentDiscoveryPhase = "idle" | "loading" | "ready" | "error";

/** Maps sanitized inventory DTOs through a closed allowlist in stable launcher order. */
export function listInstalledTerminalAgentIds(
  connections: readonly AgentLocalConnection[],
): InstalledTerminalAgentId[] {
  const installed = new Set<InstalledTerminalAgentId>();
  connections.forEach((connection) => {
    if (connection.installation !== "detected" && connection.installation !== "unsupported") return;
    const launcherId = launcherIdByConnectionId[
      connection.id as keyof typeof launcherIdByConnectionId
    ];
    if (launcherId) installed.add(launcherId);
  });
  return DESKTOP_TERMINAL_LAUNCHERS
    .map(({ id }) => id)
    .filter((id): id is InstalledTerminalAgentId => id !== "shell" && installed.has(id));
}
