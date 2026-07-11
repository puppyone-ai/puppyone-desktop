import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createAgentService } from "../electron/main/agent/agent-service.mjs";
import { createCodexRuntimeDefinition } from "../electron/main/agent/runtimes/codex/codex-runtime-definition.mjs";
import { AgentRuntimeRegistry } from "../electron/main/agent/runtime/agent-runtime-registry.mjs";
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

  it("rejects a model that is not in the inspected connected-provider catalog", async () => {
    const harness = createServiceHarness();
    const owner = createSender(32);
    const snapshot = await harness.service.createSession(owner, {}, "/workspace");

    await expect(harness.service.startTurn(owner, {
      sessionId: snapshot.session.id,
      prompt: "Use an injected model",
      model: "unconnected/hidden-model",
    })).rejects.toThrow(/no longer available from a connected provider/i);
    expect(harness.adapters[0].startTurn).not.toHaveBeenCalled();
  });

  it("does not resurrect a turn that completed before turn/start returned", async () => {
    const harness = createServiceHarness();
    const owner = createSender(31);
    const snapshot = await harness.service.createSession(owner, {}, "/workspace");
    const adapter = harness.adapters[0];
    adapter.startTurn.mockImplementationOnce(async () => {
      adapter.emit({
        type: "turn.started",
        providerSessionId: "thread-1",
        turnId: "turn-fast",
        payload: { status: "running" },
      });
      adapter.emit({
        type: "turn.completed",
        providerSessionId: "thread-1",
        turnId: "turn-fast",
        payload: { status: "completed" },
      });
      return { turnId: "turn-fast" };
    });

    await harness.service.startTurn(owner, { sessionId: snapshot.session.id, prompt: "Quick" });

    const replay = harness.service.replay(owner, { sessionId: snapshot.session.id, afterSequence: 0 });
    expect(replay.session.activeTurnId).toBeNull();
    expect(replay.session.terminalState).toBe("completed");
    expect(replay.events.filter((event) => event.type === "turn.started")).toHaveLength(1);
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
    const events = sentAgentEvents(owner);
    expect(events.some((event) => event.type === "approval.resolved" && event.payload.decision === "cancel")).toBe(true);
    expect(events.some((event) => event.type === "turn.failed")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("secret-value");
    expect(adapter.disposed).toBe(true);
    expect(harness.service.getSessionCount()).toBe(0);
  });

  it("resumes immediately from the retired in-memory snapshot after provider exit", async () => {
    const harness = createServiceHarness();
    const owner = createSender(41);
    const created = await harness.service.createSession(owner, {}, "/workspace");
    harness.adapters[0].exit({ expected: false, diagnostics: "provider crashed" });
    expect(harness.service.getSessionCount()).toBe(0);
    expect(harness.service.getRetainedSessionCount()).toBe(1);
    expect(harness.adapters[0].disposed).toBe(true);

    const resumed = await harness.service.resumeSession(owner, { sessionId: created.session.id }, "/workspace");

    expect(resumed.session.id).toBe(created.session.id);
    expect(harness.adapters).toHaveLength(2);
    expect(harness.adapters[1].resumeSession).toHaveBeenCalledWith({ threadId: "thread-1", model: "gpt-5" });
    expect(harness.service.getSessionCount()).toBe(1);
  });

  it("does not discard a retired snapshot when a different requested session is missing", async () => {
    const harness = createServiceHarness();
    const owner = createSender(42);
    await harness.service.createSession(owner, {}, "/workspace");
    harness.adapters[0].exit({ expected: false, diagnostics: "provider crashed" });

    const missing = await harness.service.resumeSession(owner, { sessionId: "missing-session" }, "/workspace");

    expect(missing).toBeNull();
    expect(harness.service.getRetainedSessionCount()).toBe(1);
    const resumed = await harness.service.resumeSession(owner, {}, "/workspace");
    expect(resumed).not.toBeNull();
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

  it("deduplicates blocking requests replayed during runtime reconciliation", async () => {
    const harness = createServiceHarness();
    const owner = createSender(51);
    const snapshot = await harness.service.createSession(owner, {}, "/workspace");
    await harness.service.startTurn(owner, { sessionId: snapshot.session.id, prompt: "Run" });
    const adapter = harness.adapters[0];
    const approval = {
      type: "approval.requested",
      providerSessionId: "thread-1",
      turnId: "turn-1",
      itemId: "item-approval",
      payload: { requestId: "runtime:approval", kind: "command", availableDecisions: ["accept", "decline", "cancel"] },
    };
    const question = {
      type: "question.requested",
      providerSessionId: "thread-1",
      turnId: "turn-1",
      itemId: "item-question",
      payload: { requestId: "runtime:question", questions: [{ question: "Continue?", options: [] }] },
    };

    adapter.emit(approval);
    adapter.emit(approval);
    adapter.emit(question);
    adapter.emit(question);

    const events = harness.service.replay(owner, { sessionId: snapshot.session.id, afterSequence: 0 }).events;
    expect(events.filter((event) => event.type === "approval.requested")).toHaveLength(1);
    expect(events.filter((event) => event.type === "question.requested")).toHaveLength(1);
  });

  it("closes every adapter during app-level cleanup", async () => {
    const harness = createServiceHarness();
    await harness.service.createSession(createSender(6), {}, "/workspace-a");
    await harness.service.createSession(createSender(7), {}, "/workspace-b");
    await harness.service.closeAll();
    expect(harness.adapters.every((adapter) => adapter.disposed)).toBe(true);
    expect(harness.service.getSessionCount()).toBe(0);
  });

  it("fails a pending approval closed then confirms the interrupt once the provider acknowledges it", async () => {
    const harness = createServiceHarness();
    const owner = createSender(10);
    const snapshot = await harness.service.createSession(owner, {}, "/workspace");
    await harness.service.startTurn(owner, { sessionId: snapshot.session.id, prompt: "Run" });
    const adapter = harness.adapters[0];
    adapter.emit({
      type: "approval.requested",
      providerSessionId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      payload: { requestId: "codex:interrupt", kind: "command", availableDecisions: ["accept", "decline", "cancel"] },
    });
    adapter.interruptTurn.mockImplementation(async () => {
      adapter.emit({
        type: "turn.interrupted",
        providerSessionId: "thread-1",
        turnId: "turn-1",
        payload: { status: "interrupted" },
      });
    });

    await harness.service.interruptTurn(owner, { sessionId: snapshot.session.id, turnId: "turn-1" });

    const replay = harness.service.replay(owner, { sessionId: snapshot.session.id, afterSequence: 0 });
    expect(replay.events.some((event) => (
      event.type === "approval.resolved" && event.payload.decision === "cancel" && event.payload.requestId === "codex:interrupt"
    ))).toBe(true);
    expect(replay.events.filter((event) => event.type === "turn.interrupted")).toHaveLength(1);
  });

  it("retires the provider instead of claiming an unconfirmed interrupt succeeded", async () => {
    vi.useFakeTimers();
    try {
      const harness = createServiceHarness();
      const owner = createSender(11);
      const snapshot = await harness.service.createSession(owner, {}, "/workspace");
      await harness.service.startTurn(owner, { sessionId: snapshot.session.id, prompt: "Run" });

      await harness.service.interruptTurn(owner, { sessionId: snapshot.session.id, turnId: "turn-1" });
      // The fake adapter acknowledges the interrupt request but never emits the
      // authoritative turn/completed notification.
      await vi.advanceTimersByTimeAsync(5_100);

      const events = sentAgentEvents(owner);
      expect(events.filter((event) => event.type === "turn.interrupted")).toHaveLength(0);
      expect(events.some((event) => event.type === "turn.failed" && String(event.payload.message).includes("did not confirm"))).toBe(true);
      expect(harness.adapters[0].disposed).toBe(true);
      expect(harness.service.getSessionCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fabricate a terminal state when the interrupt request itself fails", async () => {
    vi.useFakeTimers();
    try {
      const harness = createServiceHarness();
      const owner = createSender(12);
      const snapshot = await harness.service.createSession(owner, {}, "/workspace");
      await harness.service.startTurn(owner, { sessionId: snapshot.session.id, prompt: "Run" });
      harness.adapters[0].emit({
        type: "approval.requested",
        providerSessionId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        payload: { requestId: "codex:still-actionable", kind: "command", availableDecisions: ["accept", "decline", "cancel"] },
      });
      harness.adapters[0].interruptTurn.mockRejectedValueOnce(new Error("transport unavailable"));

      await expect(harness.service.interruptTurn(owner, {
        sessionId: snapshot.session.id,
        turnId: "turn-1",
      })).rejects.toThrow(/transport unavailable/i);
      await vi.advanceTimersByTimeAsync(5_100);

      const replay = harness.service.replay(owner, { sessionId: snapshot.session.id, afterSequence: 0 });
      expect(replay.session.activeTurnId).toBe("turn-1");
      expect(replay.events.some((event) => ["turn.failed", "turn.interrupted"].includes(event.type))).toBe(false);
      expect(replay.events.some((event) => (
        event.type === "approval.resolved" && event.payload.requestId === "codex:still-actionable"
      ))).toBe(false);
      expect(() => harness.service.resolveApproval(owner, {
        sessionId: snapshot.session.id,
        turnId: "turn-1",
        requestId: "codex:still-actionable",
        decision: "decline",
      })).not.toThrow();
      expect(harness.service.getSessionCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps only one renderer-destroyed listener per owner and removes it after the final session", async () => {
    const harness = createServiceHarness();
    const owner = Object.assign(new EventEmitter(), {
      id: 13,
      isDestroyed: () => false,
      send: vi.fn(),
    });

    const first = await harness.service.createSession(owner, {}, "/workspace-a");
    const second = await harness.service.createSession(owner, {}, "/workspace-b");
    expect(owner.listenerCount("destroyed")).toBe(1);

    await harness.service.closeSession(owner, { sessionId: first.session.id, removePersistence: true });
    expect(owner.listenerCount("destroyed")).toBe(1);
    await harness.service.closeSession(owner, { sessionId: second.session.id, removePersistence: true });
    expect(owner.listenerCount("destroyed")).toBe(0);
  });
});

describe("Agent IPC workspace authorization", () => {
  it("authorizes create and resume roots before invoking the service", async () => {
    const handlers = new Map();
    const agentService = {
      discoverProviders: vi.fn(),
      listModels: vi.fn(),
      readAccount: vi.fn(),
      createSession: vi.fn(async () => ipcSnapshot()),
      resumeSession: vi.fn(async () => ipcSnapshot()),
      replay: vi.fn(),
      closeSession: vi.fn(),
      startTurn: vi.fn(),
      steerTurn: vi.fn(async () => ({ sessionId: "s", turnId: "t", accepted: true })),
      interruptTurn: vi.fn(),
      resolveApproval: vi.fn(),
      resolveQuestion: vi.fn(async () => ({ requestId: "r", resolved: true })),
      listSessions: vi.fn(),
      forkSession: vi.fn(),
      archiveSession: vi.fn(),
      deleteSession: vi.fn(),
      compactSession: vi.fn(),
    };
    const authorizeWorkspaceRoot = vi.fn(async (_event, requested) => {
      if (requested !== "/workspace") throw new Error("Requested workspace root does not match");
      return "/canonical/workspace";
    });
    const localAgentInventory = {
      discover: vi.fn(async () => ({ connections: [], scannedAt: new Date(0).toISOString(), warnings: [] })),
    };
    registerAgentIpcHandlers({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
      agentService,
      localAgentInventory,
      authorizeWorkspaceRoot,
    });
    const event = { sender: createSender(7) };
    await expect(handlers.get("agent:session-create")(event, { rootPath: "/other" })).rejects.toThrow(/does not match/i);
    expect(agentService.createSession).not.toHaveBeenCalled();
    await handlers.get("agent:session-create")(event, { rootPath: "/workspace" });
    expect(agentService.createSession).toHaveBeenCalledWith(event.sender, { rootPath: "/workspace" }, "/canonical/workspace");
    await handlers.get("agent:session-resume")(event, { rootPath: "/workspace" });
    expect(agentService.resumeSession).toHaveBeenCalledWith(event.sender, { rootPath: "/workspace" }, "/canonical/workspace");
    await handlers.get("agent:local-connections-discover")(event, { rootPath: "/workspace", refresh: true, command: "unsafe" });
    expect(localAgentInventory.discover).toHaveBeenCalledWith({ refresh: true, workspaceRoot: "/canonical/workspace" });
    await expect(handlers.get("agent:local-connections-discover")(event, { rootPath: "/other" })).rejects.toThrow(/does not match/i);
  });

  it("registers the full README bridge list, including the fail-closed steer/question stubs", async () => {
    const handlers = new Map();
    const agentService = {
      discoverProviders: vi.fn(),
      listModels: vi.fn(),
      readAccount: vi.fn(),
      createSession: vi.fn(async () => ipcSnapshot()),
      resumeSession: vi.fn(async () => ipcSnapshot()),
      replay: vi.fn(),
      closeSession: vi.fn(),
      startTurn: vi.fn(),
      steerTurn: vi.fn(async () => ({ sessionId: "s", turnId: "t", accepted: true })),
      interruptTurn: vi.fn(),
      resolveApproval: vi.fn(),
      resolveQuestion: vi.fn(async () => ({ requestId: "r", resolved: true })),
      listSessions: vi.fn(),
      forkSession: vi.fn(),
      archiveSession: vi.fn(),
      deleteSession: vi.fn(),
      compactSession: vi.fn(),
    };
    registerAgentIpcHandlers({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
      agentService,
      localAgentInventory: { discover: vi.fn(async () => ({ connections: [], scannedAt: new Date(0).toISOString(), warnings: [] })) },
      authorizeWorkspaceRoot: vi.fn(async () => "/canonical/workspace"),
    });
    for (const channel of [
      "agent:providers-discover",
      "agent:local-connections-discover",
      "agent:models-list",
      "agent:account-read",
      "agent:session-create",
      "agent:session-resume",
      "agent:session-replay",
      "agent:sessions-list",
      "agent:session-fork",
      "agent:session-archive",
      "agent:session-delete",
      "agent:session-close",
      "agent:turn-start",
      "agent:turn-steer",
      "agent:turn-interrupt",
      "agent:session-compact",
      "agent:approval-resolve",
      "agent:question-resolve",
    ]) {
      expect(handlers.has(channel)).toBe(true);
    }
    const event = { sender: createSender(8) };
    const steerRequest = { rootPath: "/workspace", sessionId: "s", turnId: "t", message: "steer" };
    await handlers.get("agent:turn-steer")(event, steerRequest);
    expect(agentService.steerTurn).toHaveBeenCalledWith(event.sender, steerRequest, "/canonical/workspace");
    const questionRequest = { rootPath: "/workspace", sessionId: "s", turnId: "t", requestId: "r" };
    await handlers.get("agent:question-resolve")(event, questionRequest);
    expect(agentService.resolveQuestion).toHaveBeenCalledWith(event.sender, questionRequest, "/canonical/workspace");
  });
});

function createServiceHarness() {
  const adapters = [];
  const persisted = new Map();
  const runtimeRegistry = new AgentRuntimeRegistry([createCodexRuntimeDefinition({
    appVersion: "test",
    discovery: {
      discover: vi.fn(async () => ({
        provider: "codex",
        status: "ready",
        version: "0.144.1",
        minimumVersion: "0.144.1",
        executablePath: "/usr/local/bin/codex",
        environment: {},
        message: "ready",
      })),
    },
    adapterFactory: (options) => {
      const adapter = createFakeAdapter(options);
      adapters.push(adapter);
      return adapter;
    },
  })]);
  const service = createAgentService({
    runtimeRegistry,
    persistence: {
      findLatest: vi.fn(async (root) => Array.from(persisted.values()).find((entry) => entry.workspaceRoot === root) ?? null),
      findById: vi.fn(async (id, root) => {
        const entry = persisted.get(id);
        return entry?.workspaceRoot === root ? entry : null;
      }),
      list: vi.fn(async (root) => Array.from(persisted.values()).filter((entry) => entry.workspaceRoot === root)),
      save: vi.fn(async (entry) => persisted.set(entry.sessionId, entry)),
      archive: vi.fn(async () => undefined),
      remove: vi.fn(async (id) => persisted.delete(id)),
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
    resumeSession: vi.fn(async () => ({
      providerSessionId: "thread-1",
      title: "Test session",
      model: "gpt-5",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    readHistory: vi.fn(async () => []),
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
    removeListener: vi.fn(),
  };
}

function sentAgentEvents(sender) {
  return sender.send.mock.calls
    .filter(([channel]) => channel === "agent:event")
    .map(([, event]) => event);
}

function ipcSnapshot() {
  return {
    session: {
      id: "session-1",
      runtimeId: "codex",
      provider: "codex",
      providerSessionId: "thread-1",
      workspaceRoot: "/canonical/workspace",
      title: "Session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      terminalState: "idle",
      selectedModel: null,
      activeTurnId: null,
      lastSequence: 0,
    },
    account: null,
    models: [],
    capabilities: null,
    events: [],
    partial: false,
    firstAvailableSequence: 0,
    lastSequence: 0,
  };
}
