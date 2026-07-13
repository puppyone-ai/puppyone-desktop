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
import { AgentPickerPopover, agentPickerLimits } from "../src/features/desktop-agent/ui/AgentPickerPopover";
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

  it("keeps a single-row composer with accessible custom Provider and Model pickers", () => {
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

    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector('button[aria-label="Agent provider"]')?.textContent).toContain("OpenAI");
    expect(container.querySelector('button[aria-label="Agent model"]')?.textContent).toContain("GPT");
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

  it("hides configured Provider and Model labels in Minimal Mode without removing the composer", () => {
    const container = render(React.createElement(AgentComposer, {
      draft: "Continue",
      onDraftChange: vi.fn(),
      disabled: false,
      hideConfiguration: true,
      running: false,
      stopping: false,
      submitting: false,
      placeholder: "Ask anything",
      providers: [{ id: "openai", displayName: "OpenAI", modelCount: 1 }],
      selectedProviderId: "openai",
      models: [{ id: "openai/gpt", model: "openai/gpt", providerId: "openai", displayName: "GPT", description: "", isDefault: true }],
      selectedModel: "openai/gpt",
      onSubmit: vi.fn(async () => true),
      onStop: vi.fn(),
    }));

    expect(container.querySelector('button[aria-label="Agent provider"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Agent model"]')).toBeNull();
    expect(container.querySelector('textarea[aria-label="Message Agent"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Send message"]')).not.toBeNull();
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

    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector('button[aria-label="Agent provider"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Agent model"]')).toBeNull();
    expect(container.textContent).not.toContain("Agent model");
    expect((container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps a large model catalog searchable while bounding mounted picker options", () => {
    const options = Array.from({ length: 500 }, (_, index) => ({
      id: `provider/model-${index}`,
      label: `Model ${index}`,
      description: `Connected model ${index}`,
      selectable: true,
      kind: "model" as const,
    }));
    const container = render(React.createElement(AgentPickerPopover, {
      ariaLabel: "Agent model",
      placeholder: "Choose model",
      groups: [{ id: "models", label: "Models", options }],
      onSelect: vi.fn(),
    }));
    act(() => (container.querySelector('[aria-label="Agent model"]') as HTMLButtonElement).click());
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(agentPickerLimits.maxRenderedOptions);
    expect(container.textContent).toContain("Showing 120 of 500");

    const input = container.querySelector<HTMLInputElement>('.desktop-agent-picker-search input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Model 499");
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Model 499" }));
    });
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(container.textContent).toContain("Model 499");
  });

  it("shows connected routes before detected local tools without making unbridged CLIs selectable", () => {
    const onSelectProvider = vi.fn();
    const onDiscoverLocalConnections = vi.fn(async () => undefined);
    const container = render(React.createElement(AgentComposer, {
      draft: "",
      onDraftChange: vi.fn(),
      disabled: true,
      running: false,
      stopping: false,
      submitting: false,
      placeholder: "Choose a provider",
      providers: [{ id: "openai", displayName: "OpenAI", modelCount: 1 }],
      selectedProviderId: null,
      models: [],
      selectedModel: null,
      localConnections: [{
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
      }],
      localConnectionsPhase: "ready",
      onDiscoverLocalConnections,
      onSelectProvider,
      onSubmit: vi.fn(async () => false),
      onStop: vi.fn(),
    }));

    const trigger = container.querySelector('button[aria-label="Agent provider"]') as HTMLButtonElement;
    act(() => trigger.click());
    const popup = container.querySelector('[role="listbox"][aria-label="Agent provider options"]') as HTMLElement;
    expect(popup).not.toBeNull();
    expect(onDiscoverLocalConnections).toHaveBeenCalledWith(false);
    expect(popup.textContent?.indexOf("Connected routes")).toBeLessThan(popup.textContent?.indexOf("Local tools on this Mac") ?? 0);
    const codex = Array.from(popup.querySelectorAll('[role="option"]')).find((option) => option.textContent?.includes("Codex CLI")) as HTMLButtonElement;
    expect(codex.getAttribute("aria-disabled")).toBe("true");
    act(() => codex.click());
    expect(onSelectProvider).not.toHaveBeenCalled();
    expect(popup.textContent).toContain("Direct Codex sessions are not enabled.");
  });

  it("supports Arrow, Enter and Escape with focus return in the custom Provider picker", async () => {
    const onSelectProvider = vi.fn();
    const container = render(React.createElement(AgentComposer, {
      draft: "",
      onDraftChange: vi.fn(),
      disabled: true,
      running: false,
      stopping: false,
      submitting: false,
      placeholder: "Choose a provider",
      providers: [
        { id: "openai", displayName: "OpenAI", modelCount: 2 },
        { id: "anthropic", displayName: "Anthropic", modelCount: 1 },
      ],
      selectedProviderId: null,
      localConnections: [],
      localConnectionsPhase: "ready",
      onSelectProvider,
      onSubmit: vi.fn(async () => false),
      onStop: vi.fn(),
    }));
    const trigger = container.querySelector('button[aria-label="Agent provider"]') as HTMLButtonElement;
    act(() => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect((document.activeElement as HTMLElement).textContent).toContain("OpenAI");
    act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect((document.activeElement as HTMLElement).textContent).toContain("Anthropic");
    act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(onSelectProvider).toHaveBeenCalledWith("anthropic");
    expect(document.activeElement).toBe(trigger);

    act(() => trigger.click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelector('[role="listbox"][aria-label="Agent provider options"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
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

  it("renders Bash activity as a compact Claudian-style row with a bounded expandable transcript", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "command-1",
      turnId: "turn-1",
      itemId: "tool-1",
      kind: "command",
      label: "Run tests",
      status: "completed",
      output: "25 files passed",
      detail: {
        tool: "bash",
        input: { command: "npm test" },
        metadata: { exitCode: 0, duration: 842 },
      },
      sequence: 1,
    });
    const onOpenTerminal = vi.fn();
    const container = render(React.createElement(AgentTranscript, { projection, loading: false, onOpenTerminal }));
    const row = container.querySelector(".desktop-agent-tool-row") as HTMLButtonElement;
    expect(row.textContent).toContain("Bash");
    expect(row.textContent).toContain("npm test");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    act(() => row.click());
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".desktop-agent-command-line")?.textContent).toContain("$npm test");
    expect(container.querySelector(".desktop-agent-command-output")?.textContent).toContain("25 files passed");
    expect(container.querySelector(".desktop-agent-command-meta")?.textContent).toContain("Exit 0");
    const openTerminal = container.querySelector('button[aria-label="Open command in terminal"]') as HTMLButtonElement;
    act(() => openTerminal.click());
    expect(onOpenTerminal).toHaveBeenCalledTimes(1);
  });

  it("renders Write/Edit activity with file stats, inline diff lines and Review handoff", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "edit-1",
      turnId: "turn-1",
      itemId: "tool-2",
      kind: "file-change",
      label: "Updated app.ts",
      status: "completed",
      output: "",
      detail: {
        tool: "edit",
        path: "src/app.ts",
        changes: [{ path: "src/app.ts", additions: 2, deletions: 1 }],
        input: { patch: "@@ -1,2 +1,3 @@\n-old\n+new\n context" },
      },
      sequence: 1,
    });
    const onViewChanges = vi.fn();
    const onOpenFile = vi.fn();
    const container = render(React.createElement(AgentTranscript, { projection, loading: false, onViewChanges, onOpenFile }));
    const row = container.querySelector(".desktop-agent-tool-row") as HTMLButtonElement;
    expect(row.textContent).toContain("Edit");
    expect(row.textContent).toContain("src/app.ts");
    act(() => row.click());
    expect(container.querySelectorAll(".desktop-agent-diff-line.is-addition")).toHaveLength(1);
    expect(container.querySelectorAll(".desktop-agent-diff-line.is-deletion")).toHaveLength(1);
    expect(container.textContent).toContain("+2");
    const review = container.querySelector('button[aria-label="Review file changes"]') as HTMLButtonElement;
    act(() => review.click());
    expect(onViewChanges).toHaveBeenCalledTimes(1);
    act(() => (container.querySelector('button[aria-label="Open src/app.ts"]') as HTMLButtonElement).click());
    expect(onOpenFile).toHaveBeenCalledWith("src/app.ts");
  });

  it("does not render a generic File Change row or Review action without a real change", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "empty-change",
      turnId: "turn-1",
      itemId: "session-diff",
      kind: "file-change",
      label: "File changes",
      status: "completed",
      output: "",
      detail: { changes: [] },
      sequence: 1,
    });
    const container = render(React.createElement(AgentTranscript, {
      projection,
      loading: false,
      onViewChanges: vi.fn(),
    }));
    expect(container.textContent).not.toContain("File Change");
    expect(container.querySelector('button[aria-label="Review file changes"]')).toBeNull();
  });

  it("keeps Read activity compact and hands workspace paths back to the Editor surface", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "read-1",
      turnId: "turn-1",
      itemId: "tool-read",
      kind: "tool",
      label: "Read composer",
      status: "completed",
      output: "export function AgentComposer() {}",
      detail: { tool: "read", input: { path: "src/features/desktop-agent/ui/AgentComposer.tsx" } },
      sequence: 1,
    });
    const onOpenFile = vi.fn();
    const container = render(React.createElement(AgentTranscript, { projection, loading: false, onOpenFile }));
    expect(container.querySelector(".desktop-agent-tool-row")?.textContent).toContain("Read");
    const open = container.querySelector('button[aria-label="Open src/features/desktop-agent/ui/AgentComposer.tsx"]') as HTMLButtonElement;
    act(() => open.click());
    expect(onOpenFile).toHaveBeenCalledWith("src/features/desktop-agent/ui/AgentComposer.tsx");
  });

  it("renders reasoning as a quiet disclosure branch instead of a message bubble", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "reasoning-1",
      turnId: "turn-1",
      itemId: "reasoning",
      kind: "reasoning",
      label: "Reasoning summary",
      status: "completed",
      output: "",
      detail: { delta: "Compared the provider boundaries." },
      sequence: 1,
    });
    const container = render(React.createElement(AgentTranscript, { projection, loading: false }));
    expect(container.querySelector(".desktop-agent-reasoning")).not.toBeNull();
    expect(container.querySelector(".desktop-agent-message")).toBeNull();
    act(() => (container.querySelector(".desktop-agent-tool-row") as HTMLButtonElement).click());
    expect(container.textContent).toContain("Compared the provider boundaries.");
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
