import { describe, expect, it } from "vitest";
import {
  enabledLocalAgentRuntimeIds,
  installedLocalAgents,
  isLocalAgentEnabled,
  isLocalAgentRuntimeEnabled,
  localAgentActivityProviderId,
  setLocalAgentEnabled,
} from "../src/features/local-agents";
import type { AgentLocalConnection } from "../shared/agent-contract/types";

describe("Local Agent selection", () => {
  it("shows installed inventory entries and excludes missing tools", () => {
    const connections = [connection("codex", "detected"), connection("claude", "not-found")];
    expect(installedLocalAgents(connections).map(({ id }) => id)).toEqual(["codex"]);
  });

  it("persists Editor visibility independently from Agent readiness", () => {
    const enabled = setLocalAgentEnabled({ enabledAgentIds: [] }, "codex", true);
    expect(isLocalAgentEnabled(enabled, "codex")).toBe(true);
    expect(setLocalAgentEnabled(enabled, "codex", false)).toEqual({ enabledAgentIds: [] });
  });

  it("maps installed product identities to their Editor runtime routes", () => {
    const settings = { enabledAgentIds: ["codex", "cursor-agent", "opencode"] };
    expect(enabledLocalAgentRuntimeIds(settings)).toEqual(["codex", "cursor", "opencode-native"]);
    expect(isLocalAgentRuntimeEnabled(settings, "opencode-native")).toBe(true);
  });

  it("maps Cursor CLI inventory identity to its activity adapter", () => {
    expect(localAgentActivityProviderId("cursor-agent")).toBe("cursor");
    expect(localAgentActivityProviderId("claude")).toBe("claude");
  });
});

function connection(id: string, installation: AgentLocalConnection["installation"]): AgentLocalConnection {
  return {
    id,
    displayName: id,
    installation,
    version: null,
    authentication: "unknown",
    integration: "inventory-only",
    capabilities: { versionProbe: false, authenticationProbe: false, protocolProbe: false },
    selectable: false,
    statusMessage: id,
    actions: [],
  };
}
