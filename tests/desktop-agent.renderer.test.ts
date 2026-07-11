/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentApprovalDock } from "../src/features/desktop-agent/ui/AgentApprovalDock";
import { AgentChangesPill, summarizeAgentChanges } from "../src/features/desktop-agent/ui/AgentChangesPill";
import { AgentComposer } from "../src/features/desktop-agent/ui/AgentComposer";
import { AgentTranscript } from "../src/features/desktop-agent/ui/AgentTranscript";
import { createAgentProjection } from "../src/features/desktop-agent/agentProjection";
import type { AgentProviderReadiness } from "../src/features/desktop-agent/agentTypes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

describe("Desktop Agent renderer surfaces", () => {
  it("renders a document flow without visible role labels and exposes real answer actions", () => {
    const projection = createAgentProjection();
    projection.messages.push(
      {
        id: "user-1",
        role: "user",
        text: "Review this architecture",
        sequence: 1,
        turnId: "turn-1",
        itemId: null,
        streaming: false,
        terminalState: null,
      },
      {
        id: "assistant-1",
        role: "assistant",
        text: "The boundary is clean.",
        sequence: 2,
        turnId: "turn-1",
        itemId: "message-1",
        streaming: false,
        terminalState: "completed",
      },
    );

    const container = render(React.createElement(AgentTranscript, { projection, loading: false, runtimeLabel: "OpenCode" }));
    expect(container.querySelector(".desktop-agent-message-role")).toBeNull();
    expect(container.querySelector(".desktop-agent-message.is-user")?.getAttribute("aria-label")).toBe("You");
    expect(container.querySelector(".desktop-agent-message.is-assistant")?.getAttribute("aria-label")).toBe("OpenCode");
    expect(container.querySelector('button[aria-label="Copy response"]')).not.toBeNull();
  });

  it("keeps a single-row composer while exposing model and mode without a harness selector", () => {
    const container = render(React.createElement(AgentComposer, {
      draft: "",
      onDraftChange: vi.fn(),
      disabled: false,
      running: false,
      stopping: false,
      submitting: false,
      placeholder: "Ask anything",
      providers: [{ id: "openai", displayName: "OpenAI", modelCount: 1 }],
      selectedProviderId: "openai",
      models: [{ id: "openai/gpt", model: "openai/gpt", providerId: "openai", displayName: "GPT", description: "", isDefault: true }],
      selectedModel: "openai/gpt",
      modes: [{ id: "build", displayName: "Agent", description: "", isDefault: true }],
      selectedMode: "build",
      onSubmit: vi.fn(async () => true),
      onStop: vi.fn(),
    }));

    expect(container.querySelector('select[aria-label="Agent runtime"]')).toBeNull();
    const selects = container.querySelectorAll("select");
    expect(selects).toHaveLength(2);
    expect(selects[0].closest("label")?.textContent).toContain("Agent provider");
    expect(selects[1].closest("label")?.textContent).toContain("Agent model");
    expect((selects[0] as HTMLSelectElement).value).toBe("openai");
    expect((selects[1] as HTMLSelectElement).value).toBe("openai/gpt");
    expect(container.textContent).toContain("OpenAI");
    expect(container.textContent).not.toContain("OpenCode runtime");
    expect(container.querySelector("textarea")?.getAttribute("rows")).toBe("1");
    expect((container.querySelector("textarea") as HTMLTextAreaElement).style.height).toBe("20px");
    expect(container.querySelector(".desktop-agent-composer-row")).not.toBeNull();

    const toolsButton = container.querySelector('button[aria-label="Add context or change Agent mode"]') as HTMLButtonElement;
    act(() => toolsButton.click());
    expect(container.querySelector('[role="menu"][aria-label="Composer tools"]')).not.toBeNull();
    expect(container.querySelector('[role="menuitemradio"][aria-checked="true"]')?.textContent).toContain("Agent");
  });

  it("shows Provider first and withholds Model until a connected provider is selected", () => {
    const container = render(React.createElement(AgentComposer, {
      draft: "Hello",
      onDraftChange: vi.fn(),
      disabled: true,
      running: false,
      stopping: false,
      submitting: false,
      placeholder: "Choose a provider to start",
      providers: [
        { id: "anthropic", displayName: "Anthropic", modelCount: 1 },
        { id: "openai", displayName: "OpenAI", modelCount: 1 },
      ],
      selectedProviderId: null,
      models: [],
      selectedModel: null,
      onSubmit: vi.fn(async () => false),
      onStop: vi.fn(),
    }));

    expect(container.querySelectorAll("select")).toHaveLength(1);
    expect(container.querySelector("select")?.closest("label")?.textContent).toContain("Agent provider");
    expect(container.textContent).not.toContain("Agent model");
    expect((container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("summarizes real file changes in the compact Changes pill", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "change-1",
      turnId: "turn-1",
      itemId: "tool-1",
      kind: "file-change",
      label: "Edited files",
      status: "completed",
      output: "",
      detail: {
        changes: [
          { path: "src/a.ts", additions: 86, deletions: 12 },
          { path: "src/b.ts", additions: 4, deletions: 1 },
        ],
      },
      sequence: 1,
    });
    expect(summarizeAgentChanges(projection)).toEqual({ additions: 90, deletions: 13, files: 2 });
    const onViewChanges = vi.fn();
    const container = render(React.createElement(AgentChangesPill, { projection, onViewChanges }));
    const button = container.querySelector(".desktop-agent-changes-pill") as HTMLButtonElement;
    expect(button.textContent).toContain("Changes+90-13");
    act(() => button.click());
    expect(onViewChanges).toHaveBeenCalledTimes(1);
  });

  it("shows Jump to latest when the transcript is not pinned to the bottom", () => {
    const projection = createAgentProjection();
    projection.messages.push({
      id: "msg-1",
      role: "assistant",
      text: "hello".repeat(200),
      sequence: 1,
      turnId: "turn-1",
      itemId: "item-1",
      streaming: false,
      terminalState: null,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get() { return (this as HTMLElement & { _scrollTop?: number })._scrollTop ?? 0; },
      set(value: number) { (this as HTMLElement & { _scrollTop?: number })._scrollTop = value; },
    });

    const container = render(React.createElement(AgentTranscript, { projection, loading: false }));
    const transcript = container.querySelector(".desktop-agent-transcript") as HTMLElement;
    act(() => {
      transcript.scrollTop = 0;
      transcript.dispatchEvent(new Event("scroll"));
    });
    expect(container.querySelector(".desktop-agent-jump-latest")?.textContent).toContain("Jump to latest");
  });

  it("disables approval actions while a decision is resolving", () => {
    const onResolve = vi.fn();
    const container = render(React.createElement(AgentApprovalDock, {
      approval: {
        requestId: "req-1",
        turnId: "turn-1",
        itemId: "item-1",
        kind: "command",
        title: "Run npm test",
        command: "npm test",
        cwd: "/workspace",
        commandActions: [],
        networkApprovalContext: null,
        grantRoot: null,
        policyChangeRequested: false,
        reason: null,
        availableDecisions: ["accept", "decline", "cancel"],
        sequence: 1,
      },
      queueLength: 1,
      resolving: true,
      onResolve,
    }));
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("renders material network and filesystem approval scope", () => {
    const container = render(React.createElement(AgentApprovalDock, {
      approval: {
        requestId: "req-network",
        turnId: "turn-1",
        itemId: "item-1",
        kind: "command",
        title: "Allow network access",
        command: null,
        cwd: "/workspace",
        commandActions: [],
        networkApprovalContext: { host: "registry.npmjs.org:443", protocol: "https" },
        grantRoot: "/workspace/generated",
        policyChangeRequested: true,
        reason: "Download a package",
        availableDecisions: ["accept", "decline", "cancel"],
        sequence: 1,
      },
      queueLength: 1,
      resolving: false,
      onResolve: vi.fn(),
    }));

    expect(container.textContent).toContain("https://registry.npmjs.org:443");
    expect(container.textContent).toContain("/workspace/generated");
    expect(container.textContent).toContain("reusable policy change");
  });

  it("keeps incompatible runtime recovery product-owned", () => {
    const readiness: AgentProviderReadiness = {
      runtimeId: "opencode",
      provider: "opencode",
      status: "unsupported-version",
      version: "0.100.0",
      minimumVersion: "0.144.1",
      message: "The managed Agent engine is incompatible with this PuppyOne build.",
    };
    const container = render(React.createElement("div", {
      className: "desktop-agent-readiness",
      role: "status",
      children: [
        React.createElement("strong", { key: "h" }, "PuppyOne Agent needs repair"),
        React.createElement("p", { key: "p" },
          `${readiness.message} Update or reinstall PuppyOne, then retry.`,
        ),
      ],
    }));
    expect(container.textContent).toContain("PuppyOne Agent needs repair");
    expect(container.textContent).toContain("Update or reinstall PuppyOne");
    expect(container.textContent).not.toContain("Update OpenCode");
  });
});
