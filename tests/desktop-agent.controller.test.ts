import { describe, expect, it, vi } from "vitest";
import {
  AgentSessionController,
  agentSessionControllerLimits,
} from "../src/features/desktop-agent/application/AgentSessionController";
import type { AgentEvent, AgentSessionSnapshot } from "../src/features/desktop-agent/agentTypes";

describe("AgentSessionController", () => {
  it("rebuilds a deterministic projection, repairs sequence gaps, and discards the old session on New Chat", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; });
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    expect(controller.getSnapshot().selectedRuntimeId).toBe("opencode");
    expect(controller.getSnapshot().selectedProviderId).toBe("openai");
    await expect(controller.selectRuntime("codex")).resolves.toBe(false);

    eventListener?.(event(2, "turn.started", { prompt: "Fix it" }, "turn-1"));
    eventListener?.(event(3, "assistant.delta", { delta: "Working" }, "turn-1", "message-1"));
    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(controller.getSnapshot().projection.messages.map((message) => message.text)).toEqual(["Fix it", "Working"]);

    eventListener?.(event(5, "turn.completed", { status: "completed" }, "turn-1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bridge.replayAgentSession).toHaveBeenCalledWith({ rootPath: "/workspace", sessionId: "session-1", afterSequence: 3 });
    expect(controller.getSnapshot().projection.lastSequence).toBe(5);
    expect(controller.getSnapshot().projection.terminalState).toBe("completed");

    controller.rememberViewport(320, { "row:assistant:message-1": 88 }, false);
    expect(controller.readViewport()).toEqual({
      draft: "",
      scrollTop: 320,
      measurements: { "row:assistant:message-1": 88 },
      pinned: false,
    });

    await controller.newSession();
    expect(bridge.closeAgentSession).toHaveBeenCalledWith({ rootPath: "/workspace", sessionId: "session-1", removePersistence: true });
    expect(controller.getSnapshot().session?.id).toBe("session-2");
  });

  it("selects the backend catalog's first model and derives any internal inference route from the model", async () => {
    const bridge = bridgeFixture(() => {});
    bridge.discoverAgentRuntimes.mockResolvedValueOnce({
      runtimes: [{ descriptor: { id: "opencode", displayName: "OpenCode", priority: 100 }, readiness: readiness() }],
      selectedRuntimeId: "opencode",
      runtime: { id: "opencode", displayName: "OpenCode" },
      readiness: readiness(),
      account: { account: { type: "opencode", email: null, planType: null }, requiresOpenaiAuth: false },
      providers: [
        { id: "anthropic", displayName: "Anthropic", defaultModel: "anthropic/claude-sonnet", modelCount: 1 },
        { id: "openai", displayName: "OpenAI", defaultModel: "openai/gpt-5", modelCount: 1 },
      ],
      models: [
        { id: "anthropic/claude-sonnet", model: "anthropic/claude-sonnet", providerId: "anthropic", displayName: "Claude Sonnet", description: "Anthropic · Claude", isDefault: false },
        { id: "openai/gpt-5", model: "openai/gpt-5", providerId: "openai", displayName: "GPT-5", description: "OpenAI · GPT-5", isDefault: true },
      ],
      modes: [],
      commands: [],
      capabilities: capabilities(),
      warnings: [],
    });
    bridge.resumeAgentSession.mockResolvedValueOnce(null);
    const controller = new AgentSessionController("/workspace", () => bridge as never);

    await controller.initialize();

    expect(controller.getSnapshot()).toMatchObject({ selectedProviderId: "anthropic", selectedModel: "anthropic/claude-sonnet" });
    const discoveryCalls = bridge.discoverAgentRuntimes.mock.calls.length;
    const resumeCalls = bridge.resumeAgentSession.mock.calls.length;
    controller.selectModel("openai/gpt-5");
    expect(controller.getSnapshot()).toMatchObject({ selectedProviderId: "openai", selectedModel: "openai/gpt-5" });
    expect(bridge.discoverAgentRuntimes).toHaveBeenCalledTimes(discoveryCalls);
    expect(bridge.resumeAgentSession).toHaveBeenCalledTimes(resumeCalls);
    expect(bridge.createAgentSession).not.toHaveBeenCalled();
  });

  it("switches a blank composer between ready native Agents and supports providerless model catalogs", async () => {
    const bridge = bridgeFixture(() => {});
    const runtimes = [
      { descriptor: { id: "opencode", displayName: "PuppyOne Agent", iconKey: "puppyone-agent" }, readiness: readinessFor("opencode") },
      { descriptor: { id: "codex", displayName: "Codex", iconKey: "codex" }, readiness: readinessFor("codex") },
    ];
    bridge.discoverAgentRuntimes
      .mockResolvedValueOnce({
        runtimes,
        selectedRuntimeId: "opencode",
        runtime: runtimes[0].descriptor,
        readiness: readinessFor("opencode"),
        account: null,
        providers: [{ id: "openai", displayName: "OpenAI", defaultModel: "openai/gpt-5", modelCount: 1 }],
        models: [{ id: "openai/gpt-5", model: "openai/gpt-5", providerId: "openai", displayName: "GPT-5", description: "OpenAI · GPT-5", isDefault: true }],
        modes: [],
        commands: [],
        capabilities: capabilities(),
        warnings: [],
      })
      .mockResolvedValueOnce({
        runtimes,
        selectedRuntimeId: "codex",
        runtime: runtimes[1].descriptor,
        readiness: readinessFor("codex"),
        account: null,
        providers: [],
        models: [{ id: "gpt-5-codex", model: "gpt-5-codex", displayName: "GPT-5 Codex", description: "Native Codex model", isDefault: true }],
        modes: [],
        commands: [],
        capabilities: capabilities(),
        warnings: [],
      });
    bridge.resumeAgentSession.mockResolvedValue(null);
    const controller = new AgentSessionController("/workspace", () => bridge as never);

    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({ session: null, selectedRuntimeId: "opencode" });

    await expect(controller.selectRuntime("codex")).resolves.toBe(true);
    expect(bridge.discoverAgentRuntimes).toHaveBeenLastCalledWith({ rootPath: "/workspace", runtimeId: "codex", refresh: false });
    expect(controller.getSnapshot()).toMatchObject({
      selectedRuntimeId: "codex",
      selectedProviderId: null,
      selectedModel: "gpt-5-codex",
    });
  });

  it("uses the cached runtime preference for the first provider discovery", async () => {
    const bridge = bridgeFixture(() => {});
    const runtime = { descriptor: { id: "codex", displayName: "Codex", iconKey: "codex", distribution: "user-installed" }, readiness: readinessFor("codex") };
    const model = { id: "gpt-5-codex", model: "gpt-5-codex", displayName: "GPT-5 Codex", description: "", isDefault: true };
    bridge.discoverAgentRuntimes.mockResolvedValueOnce(runtimeInspection([runtime], "codex", model));
    bridge.resumeAgentSession.mockResolvedValueOnce(null);
    const controller = new AgentSessionController("/workspace", () => bridge as never);

    controller.setInitialRuntimePreference("codex");
    await controller.initialize();

    expect(bridge.discoverAgentRuntimes).toHaveBeenCalledWith({
      rootPath: "/workspace",
      runtimeId: "codex",
      refresh: false,
    });
    expect(controller.getSnapshot().selectedRuntimeId).toBe("codex");
  });

  it("switches Coding Agent providers by discarding the old PuppyOne mapping and loading the selected runtime catalog", async () => {
    const bridge = bridgeFixture(() => {});
    const runtimes = [
      { descriptor: { id: "codex", displayName: "Codex", iconKey: "codex", distribution: "user-installed" }, readiness: readinessFor("codex") },
      { descriptor: { id: "claude", displayName: "Claude Code", iconKey: "claude", distribution: "sdk-bundled" }, readiness: readinessFor("claude") },
    ];
    const codexModel = { id: "gpt-5-codex", model: "gpt-5-codex", displayName: "GPT-5 Codex", description: "Native Codex model", isDefault: true };
    const claudeModel = { id: "claude-sonnet", model: "claude-sonnet", displayName: "Claude Sonnet", description: "Native Claude model", isDefault: true };
    bridge.discoverAgentRuntimes
      .mockResolvedValueOnce(runtimeInspection(runtimes, "codex", codexModel))
      .mockResolvedValueOnce(runtimeInspection(runtimes, "claude", claudeModel));
    bridge.resumeAgentSession
      .mockResolvedValueOnce(runtimeSnapshot("codex-session", "codex", "Codex", codexModel))
      .mockResolvedValueOnce(runtimeSnapshot("claude-session", "claude", "Claude Code", claudeModel));
    const controller = new AgentSessionController("/workspace", () => bridge as never);

    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({ selectedRuntimeId: "codex", selectedModel: "gpt-5-codex" });

    await controller.stageExternalFiles([new File(["png"], "before-switch.png", { type: "image/png" })]);
    const firstEpoch = bridge.stageAgentAttachments.mock.calls.at(-1)?.[0].epoch;

    await expect(controller.selectRuntime("claude")).resolves.toBe(true);
    expect(bridge.revokeAgentAttachments).toHaveBeenCalledWith({ rootPath: "/workspace", tokens: ["stage-token"] });
    expect(bridge.closeAgentSession).toHaveBeenCalledWith({
      rootPath: "/workspace",
      sessionId: "codex-session",
      removePersistence: true,
    });
    expect(bridge.discoverAgentRuntimes).toHaveBeenLastCalledWith({ rootPath: "/workspace", runtimeId: "claude", refresh: false });
    expect(controller.getSnapshot()).toMatchObject({
      selectedRuntimeId: "claude",
      selectedProviderId: null,
      selectedModel: "claude-sonnet",
      session: { id: "claude-session", runtimeId: "claude" },
    });
    expect(controller.getSnapshot().references).toEqual([]);
    await controller.stageExternalFiles([new File(["png"], "after-switch.png", { type: "image/png" })]);
    expect(bridge.stageAgentAttachments.mock.calls.at(-1)?.[0].epoch).not.toBe(firstEpoch);
  });

  it("selects a detected runtime while keeping execution gated by its readiness", async () => {
    const bridge = bridgeFixture(() => {});
    const ready = { descriptor: { id: "codex", displayName: "Codex", iconKey: "codex" }, readiness: readinessFor("codex") };
    const unavailable = {
      descriptor: { id: "cursor", displayName: "Cursor Agent", iconKey: "cursor" },
      readiness: {
        runtimeId: "cursor",
        provider: "cursor",
        status: "protocol-unavailable" as const,
        version: "1.0.0",
        minimumVersion: null,
        message: "Native protocol unavailable",
        selectable: false,
      },
    };
    bridge.discoverAgentRuntimes
      .mockResolvedValueOnce({
        runtimes: [ready, unavailable],
        selectedRuntimeId: "codex",
        runtime: ready.descriptor,
        readiness: ready.readiness,
        account: null,
        providers: [],
        models: [{ id: "gpt-5", model: "gpt-5", displayName: "GPT-5", description: "", isDefault: true }],
        modes: [], commands: [], capabilities: capabilities(), warnings: [],
      })
      .mockResolvedValueOnce({
        runtimes: [ready, unavailable],
        selectedRuntimeId: "cursor",
        runtime: unavailable.descriptor,
        readiness: unavailable.readiness,
        account: null,
        providers: [], models: [], modes: [], commands: [], capabilities: capabilities(), warnings: [],
      });
    bridge.resumeAgentSession.mockResolvedValue(null);
    const controller = new AgentSessionController("/workspace", () => bridge as never);

    await controller.initialize();
    await expect(controller.selectRuntime("cursor")).resolves.toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      selectedRuntimeId: "cursor",
      phase: "ready",
      inspection: { readiness: { status: "protocol-unavailable" } },
    });
    expect(bridge.resumeAgentSession).toHaveBeenCalledTimes(1);
  });

  it("quarantines a provider after an authoritative credential rejection", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; });
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();

    eventListener?.(event(2, "turn.started", { prompt: "Hello" }, "turn-auth"));
    eventListener?.(event(3, "provider.error", { message: "API key not valid. Please pass a valid API key." }, "turn-auth", "assistant-auth"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(controller.getSnapshot()).toMatchObject({ selectedProviderId: null, selectedModel: null });
    expect(controller.getSnapshot().inspection?.readiness).toMatchObject({ status: "installed-not-authenticated" });
    expect(controller.getSnapshot().projection.activities.filter((activity) => activity.kind === "error")).toHaveLength(1);
  });

  it("reuses workspace Agent discovery on presentation remounts and lets Refresh bypass the cache", async () => {
    const bridge = bridgeFixture(() => {});
    bridge.resumeAgentSession.mockResolvedValue(null);
    const controller = new AgentSessionController("/workspace", () => bridge as never);

    await controller.initialize();
    await controller.initialize();
    expect(bridge.discoverAgentRuntimes).toHaveBeenCalledTimes(1);

    await controller.initialize(true);
    expect(bridge.discoverAgentRuntimes).toHaveBeenCalledTimes(2);
    expect(bridge.discoverAgentRuntimes).toHaveBeenLastCalledWith({
      rootPath: "/workspace",
      runtimeId: "opencode",
      refresh: true,
    });
    expect(agentSessionControllerLimits.discoveryCacheTtlMs).toBe(5 * 60_000);
  });

  it("discovers local tools only when the Provider surface requests them", async () => {
    const bridge = bridgeFixture(() => {});
    bridge.discoverLocalAgentConnections = vi.fn(async () => ({
      connections: [{
        id: "codex",
        displayName: "Codex CLI",
        installation: "detected",
        version: "0.144.1",
        authentication: "signed-in",
        integration: "bridge-required",
        capabilities: { versionProbe: true, authenticationProbe: true, protocolProbe: true },
        selectable: false,
        statusMessage: "Direct Codex sessions are not enabled.",
        actions: [{ id: "refresh", label: "Refresh" }],
        source: "user-installation",
      }],
      scannedAt: "2026-07-12T00:00:00.000Z",
      warnings: [],
    }));
    const controller = new AgentSessionController("/workspace", () => bridge as never);

    await controller.initialize();
    expect(bridge.discoverLocalAgentConnections).not.toHaveBeenCalled();

    await controller.discoverLocalConnections();
    expect(bridge.discoverLocalAgentConnections).toHaveBeenCalledWith({ rootPath: "/workspace", refresh: false });
    expect(controller.getSnapshot()).toMatchObject({
      localConnectionsPhase: "ready",
      localConnectionsScannedAt: "2026-07-12T00:00:00.000Z",
      localConnections: [expect.objectContaining({ id: "codex", selectable: false })],
    });

    await controller.discoverLocalConnections(true);
    expect(bridge.discoverLocalAgentConnections).toHaveBeenLastCalledWith({ rootPath: "/workspace", refresh: true });
  });

  it("bounds queued prompts and reports backpressure instead of silently dropping work", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; }, { queue: true });
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    eventListener?.(event(2, "turn.started", { prompt: "Long task" }, "turn-queue"));
    await new Promise((resolve) => setTimeout(resolve, 45));

    for (let index = 0; index < agentSessionControllerLimits.maxQueuedPrompts; index += 1) {
      await expect(controller.submit(`Follow-up ${index}`)).resolves.toBe(true);
    }
    await expect(controller.submit("Overflow")).resolves.toBe(false);
    expect(controller.getSnapshot().error).toEqual({ code: "prompt-queue-full", params: { limit: 20 } });
  });

  it("publishes an optimistic prompt immediately and clears it on the native turn-start event", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    let acceptTurn: ((value: { turnId: string }) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; });
    bridge.startAgentTurn.mockImplementationOnce(() => new Promise((resolve) => { acceptTurn = resolve; }));
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    controller.setDraft("Explain the architecture");

    const submission = controller.submit("Explain the architecture");

    expect(controller.getSnapshot()).toMatchObject({
      draft: "",
      pendingPrompt: "Explain the architecture",
      submitting: true,
    });
    eventListener?.(event(2, "turn.started", { prompt: "Explain the architecture" }, "turn-live"));
    expect(controller.getSnapshot()).toMatchObject({
      pendingPrompt: null,
      projection: { runningTurnId: "turn-live" },
    });
    acceptTurn?.({ turnId: "turn-live" });
    await expect(submission).resolves.toBe(true);
    expect(controller.getSnapshot().submitting).toBe(false);
  });

  it("shares one background session preparation with the first submit and exposes truthful transport stages", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    let resolveCreate: ((value: AgentSessionSnapshot) => void) | null = null;
    let resolveStart: ((value: { turnId: string }) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; });
    bridge.resumeAgentSession.mockResolvedValueOnce(null);
    bridge.createAgentSession.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    bridge.startAgentTurn.mockImplementationOnce(() => new Promise((resolve) => { resolveStart = resolve; }));
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();

    const preparation = controller.prepareSession();
    const duplicatePreparation = controller.prepareSession();
    const submission = controller.submit("Inspect the first-turn path");
    await vi.waitFor(() => expect(controller.getSnapshot().sessionPreparation).toBe("preparing"));

    expect(bridge.createAgentSession).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      session: null,
      sessionPreparation: "preparing",
      pendingPrompt: "Inspect the first-turn path",
    });

    resolveCreate?.(snapshot("session-2", [event(1, "session.started", { title: "New" }, null, null, "session-2")]));
    await Promise.all([preparation, duplicatePreparation]);
    await Promise.resolve();
    expect(bridge.startAgentTurn).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      session: { id: "session-2" },
      sessionPreparation: "ready",
      pendingPrompt: "Inspect the first-turn path",
    });

    eventListener?.(event(2, "turn.started", { prompt: "Inspect the first-turn path" }, "turn-first", null, "session-2"));
    expect(controller.getSnapshot()).toMatchObject({
      pendingPrompt: null,
      projection: { runningTurnId: "turn-first" },
    });
    resolveStart?.({ turnId: "turn-first" });
    await expect(submission).resolves.toBe(true);
  });

  it("closes a prepared native session that resolves after renderer disposal", async () => {
    let resolveCreate: ((value: AgentSessionSnapshot) => void) | null = null;
    const bridge = bridgeFixture(() => {});
    bridge.resumeAgentSession.mockResolvedValueOnce(null);
    bridge.createAgentSession.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();

    const preparation = controller.prepareSession();
    await vi.waitFor(() => expect(controller.getSnapshot().sessionPreparation).toBe("preparing"));
    controller.dispose();
    resolveCreate?.(snapshot("session-stale", []));

    await expect(preparation).resolves.toBe(false);
    expect(bridge.closeAgentSession).toHaveBeenCalledWith({
      rootPath: "/workspace",
      sessionId: "session-stale",
      removePersistence: true,
    });
  });

  it("does not publish late asynchronous state after renderer disposal", async () => {
    const bridge = bridgeFixture(() => {});
    const inspection = await bridge.discoverAgentRuntimes();
    let resolveDiscovery: ((value: typeof inspection) => void) | null = null;
    bridge.discoverAgentRuntimes.mockImplementationOnce(() => new Promise((resolve) => { resolveDiscovery = resolve; }));
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    const listener = vi.fn();
    controller.subscribe(listener);

    const initialize = controller.initialize();
    expect(listener).toHaveBeenCalledTimes(1);
    controller.dispose();
    resolveDiscovery?.(inspection);
    await initialize;

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("captures references inside immutable queued submission intents", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; }, { queue: true });
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    eventListener?.(event(2, "turn.started", { prompt: "Long task" }, "turn-running"));
    await new Promise((resolve) => setTimeout(resolve, 45));

    await controller.addWorkspacePaths(["a.md"]);
    await expect(controller.submit("First queued")).resolves.toBe(true);
    await controller.addWorkspacePaths(["b.md"]);
    await expect(controller.submit("Second queued")).resolves.toBe(true);
    expect(controller.getSnapshot().references).toEqual([]);

    eventListener?.(event(3, "turn.completed", { status: "completed" }, "turn-running"));
    await vi.waitFor(() => expect(bridge.startAgentTurn).toHaveBeenCalledTimes(1));
    expect(bridge.startAgentTurn.mock.calls[0][0]).toMatchObject({
      prompt: "First queued",
      references: [expect.objectContaining({ relativePath: "a.md" })],
    });
    eventListener?.(event(4, "turn.started", { prompt: "First queued" }, "turn-first"));
    eventListener?.(event(5, "turn.completed", { status: "completed" }, "turn-first"));
    await vi.waitFor(() => expect(bridge.startAgentTurn).toHaveBeenCalledTimes(2));
    expect(bridge.startAgentTurn.mock.calls[1][0]).toMatchObject({
      prompt: "Second queued",
      references: [expect.objectContaining({ relativePath: "b.md" })],
    });
  });

  it("restores a failed queued intent to the visible Composer instead of stranding it", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; }, { queue: true });
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    eventListener?.(event(2, "turn.started", { prompt: "Long task" }, "turn-running"));
    await new Promise((resolve) => setTimeout(resolve, 45));
    await controller.addWorkspacePaths(["queued.md"]);
    await expect(controller.submit("Queued request")).resolves.toBe(true);
    controller.setDraft("New draft");
    bridge.startAgentTurn.mockRejectedValueOnce(new Error("queued native start failed"));

    eventListener?.(event(3, "turn.completed", { status: "completed" }, "turn-running"));
    await vi.waitFor(() => expect(bridge.startAgentTurn).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(controller.getSnapshot().pendingIntent).toBeNull());
    expect(controller.getSnapshot()).toMatchObject({
      draft: "Queued request\n\nNew draft",
      references: [expect.objectContaining({ relativePath: "queued.md" })],
    });
  });

  it("retains references when steer cannot carry them and restores the same intent after preparation failure", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; }, {
      steer: true,
      referenceInputs: { ...referenceCapabilities(), steer: false },
    });
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    eventListener?.(event(2, "turn.started", { prompt: "Running" }, "turn-running"));
    await new Promise((resolve) => setTimeout(resolve, 45));
    await controller.addWorkspacePaths(["keep.md"]);
    await expect(controller.submit("Do not lose this")).resolves.toBe(false);
    expect(bridge.steerAgentTurn).not.toHaveBeenCalled();
    expect(controller.getSnapshot().references).toEqual([expect.objectContaining({ relativePath: "keep.md" })]);

    const failedBridge = bridgeFixture(() => {});
    failedBridge.resumeAgentSession.mockResolvedValueOnce(null);
    failedBridge.createAgentSession.mockRejectedValueOnce(new Error("cannot create"));
    const failed = new AgentSessionController("/workspace", () => failedBridge as never);
    await failed.initialize();
    await failed.addWorkspacePaths(["restore.md"]);
    failed.setDraft("Retry me");
    await expect(failed.submit("Retry me")).resolves.toBe(false);
    expect(failed.getSnapshot()).toMatchObject({
      draft: "Retry me",
      pendingIntent: null,
      references: [expect.objectContaining({ relativePath: "restore.md" })],
    });
  });

  it("merges a failed immutable intent with edits and references added while session preparation is pending", async () => {
    const bridge = bridgeFixture(() => {});
    bridge.resumeAgentSession.mockResolvedValueOnce(null);
    let rejectPreparation: ((error: Error) => void) | null = null;
    bridge.createAgentSession.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectPreparation = reject;
    }));
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    await controller.addWorkspacePaths(["original.md"]);

    const submission = controller.submit("Original request");
    await vi.waitFor(() => expect(controller.getSnapshot().pendingIntent).not.toBeNull());
    controller.setDraft("New edit while waiting");
    await controller.addWorkspacePaths(["new.md"]);
    rejectPreparation?.(new Error("cannot prepare"));

    await expect(submission).resolves.toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      draft: "Original request\n\nNew edit while waiting",
      pendingIntent: null,
      references: [
        expect.objectContaining({ relativePath: "original.md" }),
        expect.objectContaining({ relativePath: "new.md" }),
      ],
    });
  });

  it("revokes staged grants on removal and keeps external paths outside renderer state", async () => {
    const bridge = bridgeFixture(() => {});
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    const file = new File(["png"], "capture.png", { type: "image/png" });
    await expect(controller.stageExternalFiles([file])).resolves.toBe(1);
    const [reference] = controller.getSnapshot().references;
    expect(reference).toMatchObject({ kind: "staged-attachment", displayName: "capture.png", status: "ready" });
    expect(reference).not.toHaveProperty("path");
    await expect(controller.stageExternalFiles([file])).resolves.toBe(0);
    expect(controller.getSnapshot().references).toHaveLength(1);
    controller.removeReference(reference.id);
    await vi.waitFor(() => expect(bridge.revokeAgentAttachments).toHaveBeenCalledWith({
      rootPath: "/workspace",
      tokens: ["stage-token"],
    }));
  });

  it("keeps valid entries from a partial external-file batch and exposes retryable errors for the rest", async () => {
    const bridge = bridgeFixture(() => {});
    bridge.stageAgentAttachments
      .mockResolvedValueOnce([{
        id: "valid-image",
        kind: "staged-attachment",
        token: "valid-token",
        displayName: "valid.png",
        mime: "image/png",
        size: 3,
        status: "ready",
      }])
      .mockRejectedValueOnce(new Error("Only regular files can be attached."));
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    await expect(controller.stageExternalFiles([
      new File(["png"], "valid.png", { type: "image/png" }),
      new File(["bad"], "folder", { type: "application/octet-stream" }),
    ])).resolves.toBe(1);
    expect(controller.getSnapshot().references).toEqual([
      expect.objectContaining({ id: "valid-image", status: "ready" }),
      expect.objectContaining({ displayName: "folder", status: "error" }),
    ]);
  });
});

function bridgeFixture(
  onEvent: (listener: (event: AgentEvent) => void) => void,
  capabilityOverrides: Partial<ReturnType<typeof capabilities>> = {},
) {
  return {
    discoverAgentRuntimes: vi.fn(async () => ({
      runtimes: [{ descriptor: { id: "opencode", displayName: "OpenCode", priority: 100 }, readiness: readiness() }],
      selectedRuntimeId: "opencode",
      runtime: { id: "opencode", displayName: "OpenCode" },
      readiness: readiness(),
      account: { account: { type: "opencode", email: null, planType: null }, requiresOpenaiAuth: false },
      providers: [{ id: "openai", displayName: "OpenAI", defaultModel: "openai/gpt-5", modelCount: 1 }],
      models: [{ id: "openai/gpt-5", model: "openai/gpt-5", providerId: "openai", displayName: "GPT-5", description: "OpenAI · GPT-5", isDefault: true }],
      modes: [{ id: "build", displayName: "Build", description: "", isDefault: true }],
      commands: [],
      capabilities: capabilities(capabilityOverrides),
      warnings: [],
    })),
    discoverLocalAgentConnections: vi.fn(async () => ({ connections: [], scannedAt: "2026-07-12T00:00:00.000Z", warnings: [] })),
    resumeAgentSession: vi.fn(async () => snapshot("session-1", [event(1, "session.resumed", { title: "Session" })], capabilityOverrides)),
    createAgentSession: vi.fn(async () => snapshot("session-2", [event(1, "session.started", { title: "New" }, null, null, "session-2")], capabilityOverrides)),
    startAgentTurn: vi.fn(async () => ({ turnId: "turn-next" })),
    replayAgentSession: vi.fn(async () => snapshot("session-1", [event(4, "assistant.completed", { text: "Working" }, "turn-1", "message-1")], capabilityOverrides)),
    closeAgentSession: vi.fn(async () => ({ sessionId: "session-1", closed: true })),
    stageAgentAttachments: vi.fn(async () => [{
      id: "stage-reference",
      kind: "staged-attachment",
      token: "stage-token",
      displayName: "capture.png",
      mime: "image/png",
      size: 3,
      status: "ready",
    }]),
    revokeAgentAttachments: vi.fn(async ({ tokens }: { tokens: string[] }) => ({ revoked: tokens.length })),
    resolveAgentWorkspaceReferences: vi.fn(async ({ paths }: { paths: string[] }) => paths.map((referencePath, index) => ({
      id: `workspace-${index}-${referencePath.replace(/[^A-Za-z0-9]/g, "-")}`,
      kind: "workspace-entry",
      entryType: referencePath === "src" ? "directory" : "file",
      path: referencePath,
      relativePath: referencePath,
      displayName: referencePath.split("/").at(-1) || referencePath,
      mime: "text/markdown",
      size: 4,
      status: "ready",
    }))),
    pickAgentWorkspaceReferences: vi.fn(async () => []),
    steerAgentTurn: vi.fn(async () => ({ sessionId: "session-1", turnId: "turn-running", steered: true })),
    listAgentSessions: vi.fn(async () => []),
    onAgentEvent: vi.fn((listener: (event: AgentEvent) => void) => { onEvent(listener); return () => {}; }),
    onAgentSessionExit: vi.fn(() => () => {}),
  };
}

function snapshot(
  sessionId: string,
  events: AgentEvent[],
  capabilityOverrides: Partial<ReturnType<typeof capabilities>> = {},
): AgentSessionSnapshot {
  return {
    session: {
      id: sessionId,
      runtimeId: "opencode",
      runtime: { id: "opencode", displayName: "OpenCode" },
      provider: "opencode",
      providerSessionId: `native-${sessionId}`,
      workspaceRoot: "/workspace",
      title: "Session",
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
      terminalState: "idle",
      selectedModel: "openai/gpt-5",
      selectedMode: "build",
      activeTurnId: null,
      lastSequence: events.at(-1)?.sequence ?? 0,
    },
    account: { account: { type: "opencode", email: null, planType: null }, requiresOpenaiAuth: false },
    providers: [{ id: "openai", displayName: "OpenAI", defaultModel: "openai/gpt-5", modelCount: 1 }],
    models: [{ id: "openai/gpt-5", model: "openai/gpt-5", providerId: "openai", displayName: "GPT-5", description: "OpenAI · GPT-5", isDefault: true }],
    modes: [{ id: "build", displayName: "Build", description: "", isDefault: true }],
    commands: [],
    capabilities: capabilities(capabilityOverrides),
    events,
    partial: false,
    firstAvailableSequence: events[0]?.sequence ?? 1,
    lastSequence: events.at(-1)?.sequence ?? 0,
  };
}

function readiness() {
  return { runtimeId: "opencode", provider: "opencode", status: "ready" as const, version: "1.17.18", minimumVersion: "1.17.18", message: "ready" };
}

function readinessFor(runtimeId: string) {
  return { runtimeId, provider: runtimeId, status: "ready" as const, version: "1.0.0", minimumVersion: null, message: "ready", selectable: true };
}

function runtimeInspection(
  runtimes: Array<{ descriptor: { id: string; displayName: string; iconKey: string; distribution: string }; readiness: ReturnType<typeof readinessFor> }>,
  runtimeId: string,
  model: { id: string; model: string; displayName: string; description: string; isDefault: boolean },
) {
  const runtime = runtimes.find((entry) => entry.descriptor.id === runtimeId)!.descriptor;
  return {
    runtimes,
    selectedRuntimeId: runtimeId,
    runtime,
    readiness: readinessFor(runtimeId),
    account: null,
    providers: [],
    models: [model],
    modes: [],
    commands: [],
    capabilities: capabilities(),
    warnings: [],
  };
}

function runtimeSnapshot(
  sessionId: string,
  runtimeId: string,
  displayName: string,
  model: { id: string; model: string; displayName: string; description: string; isDefault: boolean },
): AgentSessionSnapshot {
  const base = snapshot(sessionId, []);
  const runtime = { id: runtimeId, displayName };
  return {
    ...base,
    session: {
      ...base.session,
      runtimeId,
      runtime,
      provider: runtimeId,
      selectedModel: model.model,
    },
    runtime,
    account: null,
    providers: [],
    models: [model],
    modes: [],
  };
}

function capabilities(overrides: Record<string, unknown> = {}) {
  return { streamingText: true, structuredToolEvents: true, commandOutputStreaming: true, fileChangeEvents: true, manualApprovals: true, structuredQuestions: true, resume: true, fork: true, steer: false, queue: false, attachments: true, contextReferences: true, modelSelection: true, modeSelection: true, slashCommands: true, sessionHistory: true, usage: true, accountState: true, mcp: true, skills: true, compaction: true, referenceInputs: referenceCapabilities(), ...overrides };
}

function referenceCapabilities() {
  return { workspaceFiles: true, workspaceDirectories: true, images: "local-snapshot", genericFiles: "none", acceptedMimeTypes: ["image/png"], maxReferences: 32, maxReferenceBytes: 25 * 1024 * 1024, maxTotalReferenceBytes: 25 * 1024 * 1024, steer: false, attachmentOnly: false };
}

function event(sequence: number, type: AgentEvent["type"], payload: Record<string, unknown>, turnId: string | null = null, itemId: string | null = null, sessionId = "session-1"): AgentEvent {
  return { schemaVersion: 1, sequence, sessionId, runtimeId: "opencode", provider: "opencode", providerSessionId: "native-1", turnId, itemId, emittedAt: new Date(sequence * 1_000).toISOString(), type, payload };
}
