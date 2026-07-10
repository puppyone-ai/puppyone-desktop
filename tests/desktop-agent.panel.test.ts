/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RightAgentPanel } from "../src/features/desktop-agent/RightAgentPanel";
import type { AgentEvent, AgentSessionSnapshot } from "../src/features/desktop-agent/agentTypes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  delete (window as Window & { puppyoneDesktop?: unknown }).puppyoneDesktop;
  document.body.innerHTML = "";
});

describe("Desktop Agent panel lifecycle", () => {
  it("disables the composer and offers recovery after the provider exits", async () => {
    const harness = createBridgeHarness();
    const container = renderPanel(harness.bridge);
    await flushEffects();
    expect((container.querySelector("textarea") as HTMLTextAreaElement).disabled).toBe(false);

    act(() => harness.exitListener?.({ sessionId: "session-1", reason: "provider-exited" }));

    expect(container.textContent).toContain("Codex stopped unexpectedly");
    expect((container.querySelector("textarea") as HTMLTextAreaElement).disabled).toBe(true);
    expect(container.textContent).toContain("provider exited");

    const newSessionButton = container.querySelector('button[aria-label="New Codex session"]') as HTMLButtonElement;
    act(() => newSessionButton.click());
    await flushEffects();
    expect(harness.bridge.closeAgentSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      removePersistence: true,
    });
  });

  it("buffers live events while replay fills a sequence gap", async () => {
    const harness = createBridgeHarness();
    harness.bridge.replayAgentSession = vi.fn(async () => snapshot([
      event(2, "turn.started", { prompt: "Fix it" }, "turn-1"),
      event(3, "assistant.delta", { delta: "Working" }, "turn-1", "message-1"),
    ]));
    const container = renderPanel(harness.bridge);
    await flushEffects();

    act(() => harness.eventListener?.(event(
      3,
      "assistant.delta",
      { delta: "Working" },
      "turn-1",
      "message-1",
    )));
    await flushEffects();

    expect(harness.bridge.replayAgentSession).toHaveBeenCalledWith({ sessionId: "session-1", afterSequence: 1 });
    expect(container.textContent).toContain("Fix it");
    expect(container.textContent).toContain("Working");
  });
});

function renderPanel(bridge: ReturnType<typeof createBridgeHarness>["bridge"]) {
  (window as Window & { puppyoneDesktop?: unknown }).puppyoneDesktop = bridge;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(React.createElement(RightAgentPanel, {
    workspace: { id: "workspace", name: "Workspace", path: "/workspace" },
    active: true,
  })));
  return container;
}

function createBridgeHarness() {
  const harness: {
    eventListener: ((event: AgentEvent) => void) | null;
    exitListener: ((event: { sessionId: string; reason: "closed" | "provider-exited" }) => void) | null;
    bridge: Record<string, ReturnType<typeof vi.fn> | ((listener: never) => () => void)>;
  } = {
    eventListener: null,
    exitListener: null,
    bridge: {},
  };
  harness.bridge = {
    discoverAgentProviders: vi.fn(async () => ({
      readiness: {
        provider: "codex",
        status: "ready",
        version: "0.144.1",
        minimumVersion: "0.144.1",
        message: "Codex is ready.",
      },
      account: { account: { type: "chatgpt", email: null, planType: null }, requiresOpenaiAuth: true },
      models: [{ id: "gpt-5", model: "gpt-5", displayName: "GPT-5", description: "", isDefault: true }],
      capabilities: capabilities(),
      warnings: [],
    })),
    resumeAgentSession: vi.fn(async () => snapshot([
      event(1, "session.resumed", { title: "Session" }),
    ])),
    replayAgentSession: vi.fn(async () => snapshot([])),
    closeAgentSession: vi.fn(async () => ({ sessionId: "session-1", closed: true })),
    createAgentSession: vi.fn(async () => snapshot([
      event(1, "session.started", { title: "New session" }),
    ])),
    onAgentEvent: ((listener: (event: AgentEvent) => void) => {
      harness.eventListener = listener;
      return () => { harness.eventListener = null; };
    }) as never,
    onAgentSessionExit: ((listener: (event: { sessionId: string; reason: "closed" | "provider-exited" }) => void) => {
      harness.exitListener = listener;
      return () => { harness.exitListener = null; };
    }) as never,
  };
  return harness;
}

function snapshot(events: AgentEvent[]): AgentSessionSnapshot {
  return {
    session: {
      id: "session-1",
      provider: "codex",
      providerSessionId: "thread-1",
      workspaceRoot: "/workspace",
      title: "Session",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      terminalState: "idle",
      selectedModel: "gpt-5",
      activeTurnId: null,
      lastSequence: events.at(-1)?.sequence ?? 1,
    },
    account: { account: { type: "chatgpt", email: null, planType: null }, requiresOpenaiAuth: true },
    models: [{ id: "gpt-5", model: "gpt-5", displayName: "GPT-5", description: "", isDefault: true }],
    capabilities: capabilities(),
    events,
    partial: false,
    firstAvailableSequence: events[0]?.sequence ?? 1,
    lastSequence: events.at(-1)?.sequence ?? 1,
  };
}

function capabilities() {
  return {
    streamingText: true,
    structuredToolEvents: true,
    commandOutputStreaming: true,
    fileChangeEvents: true,
    manualApprovals: true,
    structuredQuestions: false,
    resume: true,
    fork: false,
    steer: false,
    attachments: false,
    modelSelection: true,
    usage: true,
    accountState: true,
  };
}

function event(
  sequence: number,
  type: AgentEvent["type"],
  payload: Record<string, unknown>,
  turnId: string | null = null,
  itemId: string | null = null,
): AgentEvent {
  return {
    schemaVersion: 1,
    sequence,
    sessionId: "session-1",
    provider: "codex",
    providerSessionId: "thread-1",
    turnId,
    itemId,
    emittedAt: new Date(sequence * 1000).toISOString(),
    type,
    payload,
  };
}

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
