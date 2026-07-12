import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { OpenCodeSidecarHost } from "../electron/main/agent/runtimes/opencode-protocol/opencode-sidecar-host.mjs";

describe("OpenCode sidecar host", () => {
  it("starts lazily with loopback auth and stops with bounded lifecycle", async () => {
    const child = new FakeChild();
    const spawn = vi.fn(() => child);
    const client = {
      health: vi.fn(async () => ({ healthy: true })),
      subscribeGlobalEvents: vi.fn(async ({ signal }) => new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))),
    };
    const host = new OpenCodeSidecarHost({
      spawn,
      allocatePort: async () => 40321,
      randomBytes: () => Buffer.alloc(32, 7),
      clientFactory: () => client,
      stopTimeoutMs: 20,
    });
    await host.acquire({
      status: "ready",
      executablePath: "/opt/opencode",
      version: "1.17.18",
      environment: { PATH: "/usr/bin" },
      workspaceRoot: "/workspace",
    });
    expect(spawn).toHaveBeenCalledWith("/opt/opencode", [
      "serve", "--hostname", "127.0.0.1", "--port", "40321", "--log-level", "WARN",
    ], expect.objectContaining({ cwd: "/workspace", shell: false }));
    const options = spawn.mock.calls[0][2];
    expect(options.env.OPENCODE_SERVER_PASSWORD).toBeTruthy();
    expect(host.snapshot()).not.toHaveProperty("password");
    child.stderr.emit("data", `password=${options.env.OPENCODE_SERVER_PASSWORD}`);
    expect(host.snapshot().diagnostics).not.toContain(options.env.OPENCODE_SERVER_PASSWORD);
    const stopping = host.stop();
    queueMicrotask(() => child.emit("exit", 0, null));
    await stopping;
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("blocks a reopened event stream until native history reconciliation finishes", async () => {
    vi.useFakeTimers();
    try {
      const child = new FakeChild();
      const order = [];
      let subscription = 0;
      const client = {
        health: vi.fn(async () => ({ healthy: true })),
        subscribeGlobalEvents: vi.fn(async ({ signal, onOpen }) => {
          subscription += 1;
          await onOpen();
          if (subscription === 1) return;
          order.push("stream-released");
          await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        }),
      };
      const host = new OpenCodeSidecarHost({
        spawn: () => child,
        allocatePort: async () => 40322,
        randomBytes: () => Buffer.alloc(32, 8),
        clientFactory: () => client,
      });
      host.onReconnect(async () => {
        order.push("reconcile-started");
        await Promise.resolve();
        order.push("reconcile-finished");
      });

      await host.acquire({
        status: "ready",
        executablePath: "/opt/opencode",
        version: "1.17.18",
        environment: { PATH: "/usr/bin" },
        workspaceRoot: "/workspace",
      });
      await vi.advanceTimersByTimeAsync(500);

      expect(client.subscribeGlobalEvents).toHaveBeenCalledTimes(2);
      expect(order).toEqual(["reconcile-started", "reconcile-finished", "stream-released"]);
      const stopping = host.stop();
      queueMicrotask(() => child.emit("exit", 0, null));
      await stopping;
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a forced sidecar stop as unexpected for every attached session", async () => {
    const child = new FakeChild();
    const client = {
      health: vi.fn(async () => ({ healthy: true })),
      subscribeGlobalEvents: vi.fn(async ({ signal }) => new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))),
    };
    const host = new OpenCodeSidecarHost({
      spawn: () => child,
      allocatePort: async () => 40323,
      randomBytes: () => Buffer.alloc(32, 9),
      clientFactory: () => client,
    });
    const onExit = vi.fn();
    host.onExit(onExit);
    await host.acquire({
      status: "ready",
      executablePath: "/opt/opencode",
      version: "1.17.18",
      environment: { PATH: "/usr/bin" },
      workspaceRoot: "/workspace",
    });

    const stopping = host.stop({ expected: false });
    queueMicrotask(() => child.emit("exit", 137, "SIGKILL"));
    await stopping;

    expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ expected: false, code: 137, signal: "SIGKILL" }));
  });

  it("cancels startup before spawn when app shutdown races port allocation", async () => {
    let resolvePort;
    const allocatePort = vi.fn(() => new Promise((resolve) => { resolvePort = resolve; }));
    const spawn = vi.fn();
    const host = new OpenCodeSidecarHost({ allocatePort, spawn });
    const starting = host.acquire({
      status: "ready",
      executablePath: "/opt/opencode",
      version: "1.17.18",
      environment: { PATH: "/usr/bin" },
      workspaceRoot: "/workspace",
    });

    const stopping = host.stop();
    resolvePort(40324);

    await expect(starting).rejects.toThrow(/cancelled during application shutdown/i);
    await stopping;
    expect(spawn).not.toHaveBeenCalled();
    expect(host.snapshot().state).toBe("idle");
  });
});

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.kill = vi.fn();
  }
}
