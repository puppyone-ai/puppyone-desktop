/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RightAgentPanel } from "../src/features/desktop-agent";
import { clearAgentControllerRegistryForTests } from "../src/features/desktop-agent/application/controllerRegistry";
import type { AgentEvent, AgentSessionSnapshot } from "../src/features/desktop-agent/agentTypes";
import { stripBidiIsolation, withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  clearAgentControllerRegistryForTests();
  root = null;
  delete (window as Window & { puppyoneDesktop?: unknown }).puppyoneDesktop;
  document.body.innerHTML = "";
});

describe("Desktop Agent panel lifecycle", () => {
  it("uses one centered product loader while the chat runtime starts", async () => {
    const harness = createBridgeHarness();
    let finishDiscovery: ((inspection: ReturnType<typeof readyInspection>) => void) | null = null;
    harness.bridge.discoverAgentProviders = vi.fn(() => new Promise<ReturnType<typeof readyInspection>>((resolve) => {
      finishDiscovery = resolve;
    }));

    const container = renderPanel(harness.bridge);
    await act(async () => { await Promise.resolve(); });

    const loaders = container.querySelectorAll("[data-puppy-loader]");
    const loadingSurface = container.querySelector(".desktop-agent-startup-loading") as HTMLDivElement;
    expect(loaders).toHaveLength(1);
    expect(stripBidiIsolation(loaders[0].getAttribute("aria-label"))).toBe("Preparing Agent");
    expect(loadingSurface).not.toBeNull();
    expect(loadingSurface.style.alignItems).toBe("center");
    expect(loadingSurface.style.justifyContent).toBe("center");
    expect(container.querySelector(".desktop-agent-status-region")).toBeNull();
    expect(container.querySelector(".desktop-agent-dock-region")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).not.toMatch(/Preparing Agent|Checking Agent|Restoring session|Starting session/);

    await act(async () => { finishDiscovery?.(readyInspection()); });
    await flushEffects();
    expect(container.querySelector(".desktop-agent-startup-loading")).toBeNull();
    expect(container.querySelector(".desktop-agent-dock-region")).not.toBeNull();
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("keeps the draft editable and offers recovery after the provider exits", async () => {
    const harness = createBridgeHarness();
    const container = renderPanel(harness.bridge);
    await flushEffects();
    expect((container.querySelector("textarea") as HTMLTextAreaElement).disabled).toBe(false);

    act(() => harness.exitListener?.({ sessionId: "session-1", reason: "provider-exited" }));

    expect(stripBidiIsolation(container.textContent)).toContain("OpenCode stopped unexpectedly");
    expect((container.querySelector("textarea") as HTMLTextAreaElement).disabled).toBe(false);
    expect((container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain("provider exited");

    const newSessionButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => stripBidiIsolation(button.getAttribute("aria-label")) === "New OpenCode session");
    expect(newSessionButton).toBeDefined();
    act(() => newSessionButton?.click());
    await flushEffects();
    expect(harness.bridge.closeAgentSession).toHaveBeenCalledWith({
      rootPath: "/workspace",
      sessionId: "session-1",
      removePersistence: true,
    });
  });

  it("owns incompatible-engine recovery instead of asking users to update OpenCode", async () => {
    const harness = createBridgeHarness();
    harness.bridge.discoverAgentProviders = vi.fn(async () => ({
      runtimes: [{
        descriptor: { id: "opencode", displayName: "OpenCode", kind: "harness" },
        readiness: {
          runtimeId: "opencode",
          provider: "opencode",
          status: "unsupported-version",
          version: "1.1.33",
          minimumVersion: "1.17.18",
          source: "external",
          compatibility: "unavailable",
          message: "The configured Agent engine is incompatible with this PuppyOne build. Use PuppyOne's managed engine, then retry.",
        },
      }],
      selectedRuntimeId: "opencode",
      runtime: { id: "opencode", displayName: "OpenCode", kind: "harness" },
      readiness: {
        runtimeId: "opencode",
        provider: "opencode",
        status: "unsupported-version",
        version: "1.1.33",
        minimumVersion: "1.17.18",
        source: "external",
        compatibility: "unavailable",
        message: "The configured Agent engine is incompatible with this PuppyOne build. Use PuppyOne's managed engine, then retry.",
      },
      account: null,
      models: [],
      capabilities: null,
      warnings: [],
    }));

    const container = renderPanel(harness.bridge);
    await flushEffects();

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    expect(textarea.getAttribute("style")).toBeNull();
    const text = stripBidiIsolation(container.textContent);
    expect(text).toContain("OpenCode needs attention");
    expect(text).toContain("Update this coding Agent to a supported version");
    expect(text).toContain("The configured Agent engine is incompatible");
    expect(text).not.toContain("OpenCode update required");
    expect(container.querySelector('button[aria-label="Retry Agent engine"]')).not.toBeNull();
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

    expect(harness.bridge.replayAgentSession).toHaveBeenCalledWith({ rootPath: "/workspace", sessionId: "session-1", afterSequence: 1 });
    expect(container.textContent).toContain("Fix it");
    expect(container.textContent).toContain("Working");
  });
});

function renderPanel(bridge: ReturnType<typeof createBridgeHarness>["bridge"]) {
  (window as Window & { puppyoneDesktop?: unknown }).puppyoneDesktop = bridge;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(React.createElement(RightAgentPanel, {
    workspace: { id: "workspace", name: "Workspace", path: "/workspace" },
    active: true,
  }))));
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
    discoverAgentProviders: vi.fn(async () => readyInspection()),
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

function readyInspection() {
  return {
    runtimes: [{
      descriptor: { id: "opencode", displayName: "OpenCode", kind: "harness" },
      readiness: {
        runtimeId: "opencode",
        provider: "opencode",
        status: "ready" as const,
        version: "0.144.1",
        minimumVersion: "0.144.1",
        message: "OpenCode is ready.",
      },
    }],
    selectedRuntimeId: "opencode",
    runtime: { id: "opencode", displayName: "OpenCode", kind: "harness" },
    readiness: {
      runtimeId: "opencode",
      provider: "opencode",
      status: "ready" as const,
      version: "0.144.1",
      minimumVersion: "0.144.1",
      message: "OpenCode is ready.",
    },
    account: { account: { type: "chatgpt" as const, email: null, planType: null }, requiresOpenaiAuth: true },
    providers: [{ id: "openai", displayName: "OpenAI", defaultModel: "openai/gpt-5", modelCount: 1 }],
    models: [{ id: "openai/gpt-5", model: "openai/gpt-5", providerId: "openai", displayName: "GPT-5", description: "OpenAI · GPT-5", isDefault: true }],
    capabilities: capabilities(),
    warnings: [],
  };
}

function snapshot(events: AgentEvent[]): AgentSessionSnapshot {
  return {
    session: {
      id: "session-1",
      runtimeId: "opencode",
      runtime: { id: "opencode", displayName: "OpenCode", kind: "harness" },
      provider: "opencode",
      providerSessionId: "thread-1",
      workspaceRoot: "/workspace",
      title: "Session",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      terminalState: "idle",
      selectedModel: "openai/gpt-5",
      activeTurnId: null,
      lastSequence: events.at(-1)?.sequence ?? 1,
    },
    account: { account: { type: "chatgpt", email: null, planType: null }, requiresOpenaiAuth: true },
    providers: [{ id: "openai", displayName: "OpenAI", defaultModel: "openai/gpt-5", modelCount: 1 }],
    models: [{ id: "openai/gpt-5", model: "openai/gpt-5", providerId: "openai", displayName: "GPT-5", description: "OpenAI · GPT-5", isDefault: true }],
    capabilities: capabilities(),
    runtime: { id: "opencode", displayName: "OpenCode", kind: "harness" },
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
    queue: false,
    attachments: false,
    contextReferences: false,
    modelSelection: true,
    modeSelection: false,
    slashCommands: false,
    sessionHistory: true,
    usage: true,
    accountState: true,
    mcp: false,
    skills: false,
    compaction: false,
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
    runtimeId: "opencode",
    provider: "opencode",
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
