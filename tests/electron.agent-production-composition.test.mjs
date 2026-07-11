import { describe, expect, it, vi } from "vitest";
import { createDefaultAgentRuntimeHost } from "../electron/main/agent/bootstrap/create-agent-runtime-host.mjs";

describe("Agent production composition", () => {
  it("routes Chat to OpenCode even when a legacy Codex runtime is preferred", async () => {
    const host = createDefaultAgentRuntimeHost({
      resourcesPath: "/not-used",
      openCode: {
        discovery: {
          discover: vi.fn(async () => ({
            runtimeId: "opencode",
            provider: "opencode",
            status: "ready",
            version: "1.17.18",
            minimumVersion: "1.17.18",
            message: "ready",
          })),
        },
        host: {
          snapshot: vi.fn(() => ({ state: "idle" })),
          stop: vi.fn(async () => undefined),
        },
      },
    });

    const catalog = await host.discover();
    expect(host.descriptors().map((runtime) => runtime.id)).toEqual(["opencode"]);
    expect(host.select(catalog, "codex")?.descriptor.id).toBe("opencode");
    expect(() => host.require("codex")).toThrow("Unknown Agent runtime: codex");
    await host.dispose();
  });
});
