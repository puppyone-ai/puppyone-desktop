import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeRegistry } from "../electron/main/agent/runtime/agent-runtime-registry.mjs";

describe("Agent runtime registry", () => {
  it("selects the highest-priority ready runtime and keeps provider names out of lifecycle dispatch", async () => {
    const adapter = {
      inspect: vi.fn(),
      createSession: vi.fn(),
      resumeSession: vi.fn(),
      startTurn: vi.fn(),
      interruptTurn: vi.fn(),
      dispose: vi.fn(),
    };
    const registry = new AgentRuntimeRegistry([
      definition("direct", 10, "ready", adapter),
      definition("harness", 100, "ready", adapter),
      definition("offline", 200, "not-installed", adapter),
    ]);
    const catalog = await registry.discover();
    expect(registry.select(catalog).descriptor.id).toBe("harness");
    expect(registry.createAdapter("direct", { workspaceRoot: "/workspace" })).toBe(adapter);
    expect(registry.descriptors().map((entry) => entry.id)).toEqual(["offline", "harness", "direct"]);
    expect(registry.hasActiveResources()).toBe(false);
  });
});

function definition(id, priority, status, adapter) {
  return {
    descriptor: { id, priority, displayName: id, kind: "test" },
    discovery: { discover: vi.fn(async () => ({ runtimeId: id, status, executablePath: status === "ready" ? `/${id}` : null })) },
    createAdapter: vi.fn(() => adapter),
  };
}
