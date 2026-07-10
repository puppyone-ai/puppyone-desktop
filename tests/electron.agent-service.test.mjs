import { describe, expect, it, vi } from "vitest";
import { createAgentService } from "../electron/main/agent/agent-service.mjs";
import { registerAgentIpcHandlers } from "../electron/main/ipc/agent-ipc.mjs";

describe("Electron AgentService ownership and lifecycle", () => {
  it("binds sessions to one sender and rejects cross-window mutations", async () => {
    const harness = createServiceHarness();
    const owner = createSender(1);
    const attacker = createSender(2);
    const snapshot = await harness.service.createSession(owner, {}, "/workspace");

    expect(() => harness.service.replay(attacker, {
      sessionId: snapshot.session.id,
      afterSequence: 0,
    })).toThrow(/another window/i);
    await expect(harness.service.startTurn(attacker, {
      sessionId: snapshot.session.id,
      prompt: "attack",
    })).rejects.toThrow(/another window/i);
    await expect(harness.service.interruptTurn(attacker, {
      sessionId: snapshot.session.id,
      turnId: "turn-1",
    })).rejects.toThrow(/another window/i);
    await expect(harness.service.closeSession(attacker, {
      sessionId: snapshot.session.id,
    })).rejects.toThrow(/another window/i);
  });

  it("keeps a turn alive without renderer visibility and cleans up on window close", async () => {
    const harness = createServiceHarness();
    const owner = createSender(3);
    const snapshot = await harness.service.createSession(owner, {}, "/workspace");
    const result = await harness.service.startTurn(owner, {
      sessionId: snapshot.session.id,
      prompt: "Keep running",
    });
    expect(result.turnId).toBe("turn-1");
    expect(harness.adapters[0].disposed).toBe(false);

    await harness.service.closeSessionsForWindow(owner.id);
    expect(harness.adapters[0].disposed).toBe(true);
    expect(harness.service.getSessionCount()).toBe(0);
  });

  it("fails pending approvals closed and emits terminal failure on provider exit", async () => {
    const harness = createServiceHarness();
    const owner = createSender(4);
    const snapshot = await harness.service.createSession(owner, {}, "/workspace");
    await harness.service.startTurn(owner, { sessionId: snapshot.session.id, prompt: "Run" });
    const adapter = harness.adapters[0];
    adapter.emit({
      type: "approval.requested",
      providerSessionId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      payload: { requestId: "codex:1", kind: "command", availableDecisions: ["accept", "decline", "cancel"] },
    });
    adapter.exit({ expected: false, diagnostics: "token=secret-value" });
    const replay = harness.service.replay(owner, { sessionId: snapshot.session.id, afterSequence: 0 });
    expect(replay.events.some((event) => event.type === "approval.resolved" && event.payload.decision === "cancel")).toBe(true);
    expect(replay.events.some((event) => event.type === "turn.failed")).toBe(true);
    expect(JSON.stringify(replay.events)).not.toContain("secret-value");
  });

  it("rejects stale approvals and bounds retained replay for a slow renderer", async () => {
    const harness = createServiceHarness();
    const owner = createSender(5);
    const snapshot = await harness.service.createSession(owner, {}, "/workspace");
    await harness.service.startTurn(owner, { sessionId: snapshot.session.id, prompt: "Run" });
    const adapter = harness.adapters[0];
    adapter.emit({
      type: "approval.requested",
      providerSessionId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      payload: { requestId: "codex:2", kind: "command", availableDecisions: ["accept", "decline", "cancel"] },
    });
    expect(harness.service.resolveApproval(owner, {
      sessionId: snapshot.session.id,
      turnId: "turn-1",
      requestId: "codex:2",
      decision: "decline",
    })).toMatchObject({ decision: "decline" });
    expect(() => harness.service.resolveApproval(owner, {
      sessionId: snapshot.session.id,
      turnId: "turn-1",
      requestId: "codex:2",
      decision: "accept",
    })).toThrow(/stale/i);

    for (let index = 0; index < 1_100; index += 1) {
      adapter.emit({ type: "provider.warning", payload: { message: `warning ${index}` } });
    }
    const replay = harness.service.replay(owner, { sessionId: snapshot.session.id, afterSequence: 0 });
    expect(replay.events.length).toBeLessThanOrEqual(1_000);
    expect(replay.firstAvailableSequence).toBeGreaterThan(1);
  });

  it("closes every adapter during app-level cleanup", async () => {
    const harness = createServiceHarness();
    await harness.service.createSession(createSender(6), {}, "/workspace-a");
    await harness.service.createSession(createSender(7), {}, "/workspace-b");
    await harness.service.closeAll();
    expect(harness.adapters.every((adapter) => adapter.disposed)).toBe(true);
    expect(harness.service.getSessionCount()).toBe(0);
  });
});

describe("Agent IPC workspace authorization", () => {
  it("authorizes create and restore roots before invoking the service", async () => {
    const handlers = new Map();
    const agentService = {
      discoverProvider: vi.fn(),
      createSession: vi.fn(),
      restoreSession: vi.fn(),
      replay: vi.fn(),
      closeSession: vi.fn(),
      startTurn: vi.fn(),
      interruptTurn: vi.fn(),
      resolveApproval: vi.fn(),
    };
    const authorizeWorkspaceRoot = vi.fn(async (_event, requested) => {
      if (requested !== "/workspace") throw new Error("Requested workspace root does not match");
      return "/canonical/workspace";
    });
    registerAgentIpcHandlers({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
      agentService,
      authorizeWorkspaceRoot,
    });
    const event = { sender: createSender(7) };
    await expect(handlers.get("agent:session-create")(event, { rootPath: "/other" })).rejects.toThrow(/does not match/i);
    expect(agentService.createSession).not.toHaveBeenCalled();
    await handlers.get("agent:session-create")(event, { rootPath: "/workspace" });
    expect(agentService.createSession).toHaveBeenCalledWith(event.sender, { rootPath: "/workspace" }, "/canonical/workspace");
    await handlers.get("agent:session-restore")(event, { rootPath: "/workspace" });
    expect(agentService.restoreSession).toHaveBeenCalledWith(event.sender, { rootPath: "/workspace" }, "/canonical/workspace");
  });
});

function createServiceHarness() {
  const adapters = [];
  const persisted = new Map();
  const service = createAgentService({
    appVersion: "test",
    discovery: {
      discover: vi.fn(async () => ({
        provider: "codex",
        status: "ready",
        version: "0.144.1",
        minimumVersion: "0.100.0",
        executablePath: "/usr/local/bin/codex",
        environment: {},
        message: "ready",
      })),
    },
    persistence: {
      findLatest: vi.fn(async (root) => Array.from(persisted.values()).find((entry) => entry.workspaceRoot === root) ?? null),
      save: vi.fn(async (entry) => persisted.set(entry.sessionId, entry)),
      remove: vi.fn(async (id) => persisted.delete(id)),
    },
    adapterFactory: (options) => {
      const adapter = createFakeAdapter(options);
      adapters.push(adapter);
      return adapter;
    },
    logger: { warn: vi.fn() },
  });
  return { service, adapters };
}

function createFakeAdapter(options) {
  return {
    disposed: false,
    inspect: vi.fn(async () => ({
      account: { account: { type: "chatgpt", email: "user@example.com", planType: "plus" }, requiresOpenaiAuth: true },
      models: [{ id: "gpt-5", model: "gpt-5", displayName: "GPT-5", isDefault: true }],
      capabilities: { manualApprovals: true },
      warnings: [],
    })),
    createSession: vi.fn(async () => ({
      providerSessionId: "thread-1",
      title: "Test session",
      model: "gpt-5",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    resumeSession: vi.fn(),
    startTurn: vi.fn(async () => {
      options.onEvent({ type: "turn.started", providerSessionId: "thread-1", turnId: "turn-1", payload: { status: "running" } });
      return { turnId: "turn-1" };
    }),
    interruptTurn: vi.fn(async () => undefined),
    resolveApproval: vi.fn(),
    dispose: vi.fn(function dispose() { this.disposed = true; }),
    emit: options.onEvent,
    exit: options.onExit,
  };
}

function createSender(id) {
  return {
    id,
    isDestroyed: () => false,
    send: vi.fn(),
    once: vi.fn(),
  };
}
