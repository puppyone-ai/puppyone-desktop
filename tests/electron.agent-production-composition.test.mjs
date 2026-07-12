import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AGENT_RUNTIME_ID,
  createDefaultAgentRuntimeHost,
} from "../electron/main/agent/bootstrap/create-agent-runtime-host.mjs";

describe("Agent production composition", () => {
  it("registers independent native backends and never silently replaces an explicit selection", async () => {
    const host = productionHost({
      "puppyone-agent": readiness("puppyone-agent", "not-installed"),
      codex: readiness("codex", "ready"),
      claude: readiness("claude", "ready"),
      "opencode-native": readiness("opencode-native", "not-installed"),
      cursor: readiness("cursor", "protocol-unavailable"),
    });

    const catalog = await host.discover();
    expect(host.descriptors().map((runtime) => runtime.id)).toEqual([
      "puppyone-agent",
      "codex",
      "claude",
      "opencode-native",
      "cursor",
    ]);
    expect(DEFAULT_AGENT_RUNTIME_ID).toBe("puppyone-agent");
    expect(host.select(catalog)?.descriptor.id).toBe("puppyone-agent");
    expect(host.select(catalog, "codex")?.descriptor.id).toBe("codex");
    expect(host.select(catalog, "missing")).toBeNull();
    expect(host.require("claude").descriptor.displayName).toBe("Claude Code");
    await host.dispose();
  });

  it("isolates discovery failure to the backend that failed", async () => {
    const brokenDiscovery = { discover: vi.fn(async () => { throw new Error("managed engine failed"); }) };
    const host = productionHost({
      "puppyone-agent": brokenDiscovery,
      codex: readiness("codex", "ready"),
      claude: readiness("claude", "not-installed"),
      "opencode-native": readiness("opencode-native", "not-installed"),
      cursor: readiness("cursor", "protocol-unavailable"),
    }, { rawDiscovery: true });

    const catalog = await host.discover();
    expect(catalog.find((entry) => entry.descriptor.id === "puppyone-agent")?.readiness).toMatchObject({ status: "error" });
    expect(catalog.find((entry) => entry.descriptor.id === "codex")?.readiness).toMatchObject({ status: "ready" });
    expect(host.select(catalog, "codex")?.descriptor.id).toBe("codex");
    await host.dispose();
  });
});

function productionHost(values, { rawDiscovery = false } = {}) {
  const discovery = (id) => rawDiscovery && values[id]?.discover
    ? values[id]
    : { discover: vi.fn(async () => values[id]) };
  return createDefaultAgentRuntimeHost({
    openCode: { discovery: discovery("puppyone-agent"), host: idleHost() },
    codex: { discovery: discovery("codex") },
    claude: { discovery: discovery("claude") },
    openCodeNative: { discovery: discovery("opencode-native"), host: idleHost() },
    cursor: { discovery: discovery("cursor") },
  });
}

function readiness(runtimeId, status) {
  return {
    runtimeId,
    provider: runtimeId,
    status,
    version: status === "ready" ? "1.0.0" : null,
    minimumVersion: null,
    executablePath: status === "ready" ? `/${runtimeId}` : null,
    environment: {},
    message: status,
  };
}

function idleHost() {
  return {
    snapshot: vi.fn(() => ({ state: "idle" })),
    stop: vi.fn(async () => undefined),
  };
}
