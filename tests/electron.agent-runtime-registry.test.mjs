import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeRegistry } from "../electron/main/agent/runtime/agent-runtime-registry.mjs";
import { defineAgentRuntimeManifest } from "../electron/main/agent/runtime/agent-runtime-manifest.mjs";

describe("Agent runtime registry", () => {
  it("selects the configured default without readiness fallback and keeps lifecycle dispatch neutral", async () => {
    const adapter = {
      inspect: vi.fn(),
      createSession: vi.fn(),
      resumeSession: vi.fn(),
      readHistory: vi.fn(),
      startTurn: vi.fn(),
      interruptTurn: vi.fn(),
      dispose: vi.fn(),
    };
    const registry = new AgentRuntimeRegistry([
      definition("direct", 10, "ready", adapter),
      definition("harness", 100, "ready", adapter),
      definition("offline", 200, "not-installed", adapter),
    ], { defaultRuntimeId: "harness" });
    const catalog = await registry.discover();
    expect(registry.select(catalog).descriptor.id).toBe("harness");
    expect(registry.select(catalog, "offline")?.descriptor.id).toBe("offline");
    expect(registry.select(catalog, "missing")).toBeNull();
    expect(registry.createAdapter("direct", { workspaceRoot: "/workspace" })).toBe(adapter);
    expect(registry.descriptors().map((entry) => entry.id)).toEqual(["offline", "harness", "direct"]);
    expect(registry.manifests().map((entry) => entry.id)).toEqual(["offline", "harness", "direct"]);
    expect(registry.hasActiveResources()).toBe(false);
  });

  it("requires one manifest source of truth instead of a separately maintained descriptor", () => {
    expect(() => new AgentRuntimeRegistry([{
      descriptor: { id: "legacy", displayName: "Legacy" },
      discovery: { discover: vi.fn() },
      createAdapter: vi.fn(),
    }])).toThrow(/requires a manifest/i);

    expect(() => new AgentRuntimeRegistry([{
      manifest: manifest("duplicate-source", 1),
      descriptor: { id: "duplicate-source", displayName: "Stale label" },
      discovery: { discover: vi.fn() },
      createAdapter: vi.fn(),
    }])).toThrow(/derived from manifests/i);
  });

  it("attempts cleanup for every backend even when one cleanup fails", async () => {
    const firstDispose = vi.fn(async () => { throw new Error("first failed"); });
    const secondDispose = vi.fn(async () => undefined);
    const adapter = {
      inspect() {}, createSession() {}, resumeSession() {}, readHistory() {},
      startTurn() {}, interruptTurn() {}, dispose() {},
    };
    const first = { ...definition("first", 2, "ready", adapter), dispose: firstDispose };
    const second = { ...definition("second", 1, "ready", adapter), dispose: secondDispose };
    const registry = new AgentRuntimeRegistry([first, second]);

    await expect(registry.dispose()).rejects.toThrow(/failed to dispose cleanly/i);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
  });
});

function definition(id, priority, status, adapter) {
  return {
    manifest: manifest(id, priority),
    discovery: { discover: vi.fn(async () => ({ runtimeId: id, status, executablePath: status === "ready" ? `/${id}` : null })) },
    createAdapter: vi.fn(() => adapter),
  };
}

function manifest(id, priority) {
  return defineAgentRuntimeManifest({
    id,
    priority,
    displayName: id,
    execution: { kind: "local-process", distribution: "user-installed", controller: "bundled-adapter" },
    protocol: { kind: "rpc", transport: "stdio-json-rpc" },
    integration: { kind: "specialized-native", adapter: "specialized" },
    trust: { level: "first-party", publisher: "Fixture" },
    ownership: {
      harness: "runtime",
      credentials: ["runtime"],
      models: "runtime",
      billing: ["runtime"],
      session: "runtime",
    },
  });
}
