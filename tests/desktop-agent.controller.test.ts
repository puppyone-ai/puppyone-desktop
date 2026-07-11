import { describe, expect, it, vi } from "vitest";
import { AgentSessionController } from "../src/features/desktop-agent/application/AgentSessionController";
import type { AgentEvent, AgentSessionSnapshot } from "../src/features/desktop-agent/agentTypes";

describe("AgentSessionController", () => {
  it("rebuilds a deterministic projection, repairs sequence gaps, and preserves old sessions on New Chat", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    const bridge = bridgeFixture((listener) => { eventListener = listener; });
    const controller = new AgentSessionController("/workspace", () => bridge as never);
    await controller.initialize();
    expect(controller.getSnapshot().selectedRuntimeId).toBe("opencode");
    expect(controller.getSnapshot().selectedProviderId).toBe("openai");

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
    expect(bridge.closeAgentSession).toHaveBeenCalledWith({ rootPath: "/workspace", sessionId: "session-1", removePersistence: false });
    expect(controller.getSnapshot().session?.id).toBe("session-2");
  });

  it("requires an explicit provider before choosing a model when multiple routes are connected", async () => {
    const bridge = bridgeFixture(() => {});
    bridge.discoverAgentProviders.mockResolvedValueOnce({
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
        { id: "anthropic/claude-sonnet", model: "anthropic/claude-sonnet", providerId: "anthropic", displayName: "Claude Sonnet", description: "Anthropic · Claude", isDefault: true },
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

    expect(controller.getSnapshot()).toMatchObject({ selectedProviderId: null, selectedModel: null });
    expect(controller.selectProvider("openai")).toBe("openai/gpt-5");
    expect(controller.getSnapshot()).toMatchObject({ selectedProviderId: "openai", selectedModel: "openai/gpt-5" });
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
});

function bridgeFixture(onEvent: (listener: (event: AgentEvent) => void) => void) {
  return {
    discoverAgentProviders: vi.fn(async () => ({
      runtimes: [{ descriptor: { id: "opencode", displayName: "OpenCode", priority: 100 }, readiness: readiness() }],
      selectedRuntimeId: "opencode",
      runtime: { id: "opencode", displayName: "OpenCode" },
      readiness: readiness(),
      account: { account: { type: "opencode", email: null, planType: null }, requiresOpenaiAuth: false },
      providers: [{ id: "openai", displayName: "OpenAI", defaultModel: "openai/gpt-5", modelCount: 1 }],
      models: [{ id: "openai/gpt-5", model: "openai/gpt-5", providerId: "openai", displayName: "GPT-5", description: "OpenAI · GPT-5", isDefault: true }],
      modes: [{ id: "build", displayName: "Build", description: "", isDefault: true }],
      commands: [],
      capabilities: capabilities(),
      warnings: [],
    })),
    discoverLocalAgentConnections: vi.fn(async () => ({ connections: [], scannedAt: "2026-07-12T00:00:00.000Z", warnings: [] })),
    resumeAgentSession: vi.fn(async () => snapshot("session-1", [event(1, "session.resumed", { title: "Session" })])),
    createAgentSession: vi.fn(async () => snapshot("session-2", [event(1, "session.started", { title: "New" }, null, null, "session-2")])),
    replayAgentSession: vi.fn(async () => snapshot("session-1", [event(4, "assistant.completed", { text: "Working" }, "turn-1", "message-1")])),
    closeAgentSession: vi.fn(async () => ({ sessionId: "session-1", closed: true })),
    listAgentSessions: vi.fn(async () => []),
    onAgentEvent: vi.fn((listener: (event: AgentEvent) => void) => { onEvent(listener); return () => {}; }),
    onAgentSessionExit: vi.fn(() => () => {}),
  };
}

function snapshot(sessionId: string, events: AgentEvent[]): AgentSessionSnapshot {
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
    capabilities: capabilities(),
    events,
    partial: false,
    firstAvailableSequence: events[0]?.sequence ?? 1,
    lastSequence: events.at(-1)?.sequence ?? 0,
  };
}

function readiness() {
  return { runtimeId: "opencode", provider: "opencode", status: "ready" as const, version: "1.17.18", minimumVersion: "1.17.18", message: "ready" };
}

function capabilities() {
  return { streamingText: true, structuredToolEvents: true, commandOutputStreaming: true, fileChangeEvents: true, manualApprovals: true, structuredQuestions: true, resume: true, fork: true, steer: false, queue: false, attachments: true, contextReferences: true, modelSelection: true, modeSelection: true, slashCommands: true, sessionHistory: true, usage: true, accountState: true, mcp: true, skills: true, compaction: true };
}

function event(sequence: number, type: AgentEvent["type"], payload: Record<string, unknown>, turnId: string | null = null, itemId: string | null = null, sessionId = "session-1"): AgentEvent {
  return { schemaVersion: 1, sequence, sessionId, runtimeId: "opencode", provider: "opencode", providerSessionId: "native-1", turnId, itemId, emittedAt: new Date(sequence * 1_000).toISOString(), type, payload };
}
