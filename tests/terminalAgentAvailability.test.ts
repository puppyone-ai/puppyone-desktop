import { describe, expect, it } from "vitest";
import type { AgentLocalConnection } from "../shared/agent-contract/types";
import { listInstalledTerminalAgentIds } from "../src/features/desktop-terminal/model/terminalAgentAvailability";

describe("Terminal Agent availability", () => {
  it("maps only installed allowlisted Agents in stable launcher order", () => {
    expect(listInstalledTerminalAgentIds([
      connection("opencode", "detected"),
      connection("unknown-agent", "detected"),
      connection("claude", "not-found"),
      connection("cursor-agent", "unsupported"),
      connection("codex", "detected"),
    ])).toEqual(["codex", "cursor", "opencode"]);
  });
});

function connection(
  id: string,
  installation: AgentLocalConnection["installation"],
): AgentLocalConnection {
  return {
    id,
    displayName: id,
    installation,
    version: null,
    authentication: "unknown",
    integration: "inventory-only",
    capabilities: {
      versionProbe: false,
      authenticationProbe: false,
      protocolProbe: false,
    },
    selectable: false,
    statusMessage: "",
    actions: [],
  };
}
