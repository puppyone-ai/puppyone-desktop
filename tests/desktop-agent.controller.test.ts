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
});

function bridgeFixture(onEvent: (listener: (event: AgentEvent) => void) => void) {
  return {
    discoverAgentProviders: vi.fn(async () => ({
      runtimes: [{ descriptor: { id: "opencode", displayName: "OpenCode", priority: 100 }, readiness: readiness() }],
      selectedRuntimeId: "opencode",
      runtime: { id: "opencode", displayName: "OpenCode" },
      readiness: readiness(),
      account: { account: { type: "opencode", email: null, planType: null }, requiresOpenaiAuth: false },
      models: [{ id: "openai/gpt-5", model: "openai/gpt-5", displayName: "GPT-5", description: "", isDefault: true }],
      modes: [{ id: "build", displayName: "Build", description: "", isDefault: true }],
      commands: [],
      capabilities: capabilities(),
      warnings: [],
    })),
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
    models: [{ id: "openai/gpt-5", model: "openai/gpt-5", displayName: "GPT-5", description: "", isDefault: true }],
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
