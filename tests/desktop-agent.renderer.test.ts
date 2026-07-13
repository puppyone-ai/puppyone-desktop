/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentApprovalDock } from "../src/features/desktop-agent/ui/AgentApprovalDock";
import { AgentChangesPill, summarizeAgentChanges } from "../src/features/desktop-agent/ui/AgentChangesPill";
import { AgentComposer } from "../src/features/desktop-agent/ui/AgentComposer";
import { AgentPanelLayout } from "../src/features/desktop-agent/ui/AgentPanelLayout";
import { AgentPickerPopover } from "../src/features/desktop-agent/ui/AgentPickerPopover";
import { AgentProviderPicker } from "../src/features/desktop-agent/ui/AgentProviderPicker";
import { AgentSurfaceHeader } from "../src/features/desktop-agent/ui/AgentSurfaceHeader";
import { agentPickerLimits } from "../src/features/desktop-agent/ui/agent-picker-limits";
import {
  AgentTranscript,
  agentSubmissionStatusLabel,
  shouldShowAgentThinking,
} from "../src/features/desktop-agent/ui/AgentTranscript";
import { resolveAnchoredOverlayPosition } from "../src/features/app-shell/useAnchoredOverlayPosition";
import { createAgentProjection } from "../src/features/desktop-agent/agentProjection";
import { listCodingAgentProviders } from "../src/features/desktop-agent/domain/agent-backend-routing";
import type { AgentProviderReadiness } from "../src/features/desktop-agent/agentTypes";
import { stripBidiIsolation, testT, withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  document.head.querySelectorAll("style[data-agent-layout-test]").forEach((node) => node.remove());
});

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(node)));
  return container;
}

function codingProvider(id: string, displayName: string) {
  return {
    descriptor: { id, displayName, iconKey: id, distribution: "user-installed" },
    readiness: {
      runtimeId: id,
      provider: id,
      status: "ready" as const,
      version: "1.0.0",
      minimumVersion: null,
      message: "Ready",
      selectable: true,
    },
  };
}

describe("Desktop Agent renderer surfaces", () => {
  it("keeps the ready empty transcript visually blank", () => {
    const container = render(React.createElement(AgentTranscript, {
      projection: createAgentProjection(),
      loading: false,
      runtimeLabel: "Codex",
    }));

    expect(container.textContent).toBe("");
    expect(container.querySelector(".desktop-agent-empty")).toBeNull();
  });

  it("renders the structural regions and applies the real layout CSS contract", () => {
    const style = document.createElement("style");
    style.dataset.agentLayoutTest = "true";
    style.textContent = ["foundation.css", "composer.css", "pickers.css"]
      .map((file) => readFileSync(`${process.cwd()}/src/features/desktop-agent/ui/styles/${file}`, "utf8"))
      .join("\n");
    document.head.appendChild(style);

    const container = render(React.createElement(AgentPanelLayout, {
      ariaLabel: "Layout contract",
      header: React.createElement(AgentSurfaceHeader, {
        title: "New chat",
        runtimeLabel: "Codex",
        statusCode: "ready",
        statusLabel: "ready",
        loading: false,
        newSessionDisabled: false,
        onNewSession: vi.fn(),
        agentSelector: React.createElement(AgentProviderPicker, {
          agentProviders: [codingProvider("codex", "Codex")],
          selectedAgentProviderId: "codex",
          onSelectAgentProvider: vi.fn(),
        }),
      }),
      status: React.createElement("span", null, "Status"),
      conversation: React.createElement("span", null, "Conversation"),
      dock: React.createElement(AgentComposer, {
        draft: "Ready",
        onDraftChange: vi.fn(),
        disabled: false,
        running: false,
        stopping: false,
        submitting: false,
        placeholder: "Ask anything",
        models: [{ id: "gpt-5", model: "gpt-5", displayName: "GPT-5", description: "", isDefault: true }],
        selectedModel: "gpt-5",
        onSubmit: vi.fn(async () => true),
        onStop: vi.fn(),
      }),
    }));
    const boundary = container.querySelector(".desktop-agent-boundary") as HTMLElement;
    const panel = container.querySelector(".desktop-agent-panel") as HTMLElement;
    const dock = container.querySelector(".desktop-agent-dock-region") as HTMLElement;

    expect(style.sheet?.cssRules.length).toBeGreaterThan(0);
    expect(boundary.children).toHaveLength(1);
    expect(panel.children).toHaveLength(4);
    expect(window.getComputedStyle(panel).display).toBe("grid");
    expect(window.getComputedStyle(dock).paddingTop).toBe("12px");
    expect(window.getComputedStyle(dock).paddingRight).toBe("12px");
    expect(window.getComputedStyle(dock).paddingBottom).toBe("12px");
    expect(window.getComputedStyle(dock).paddingLeft).toBe("12px");
    const providerControl = container.querySelector('button[aria-label="Coding agent provider"]') as HTMLElement;
    const modelControl = container.querySelector('button[aria-label="Agent model"]') as HTMLElement;
    const sendControl = container.querySelector('button[aria-label="Send message"]') as HTMLElement;
    expect(window.getComputedStyle(providerControl).height).toBe("30px");
    expect(window.getComputedStyle(sendControl).width).toBe("30px");
    expect(window.getComputedStyle(sendControl).height).toBe("30px");
    expect(window.getComputedStyle(modelControl).height).toBe("30px");
  });

  it("removes the Agent header region when Minimal Mode supplies no header", () => {
    const container = render(React.createElement(AgentPanelLayout, {
      ariaLabel: "Minimal Agent layout",
      header: null,
      conversation: React.createElement("span", null, "Conversation"),
    }));

    expect(container.querySelector(".desktop-agent-header-region")).toBeNull();
    expect(container.querySelector(".desktop-agent-conversation-region")).not.toBeNull();
  });

  it("keeps anchored overlays inside the Agent boundary and prefers the available side", () => {
    const position = resolveAnchoredOverlayPosition({
      anchor: { top: 700, right: 430, bottom: 730, left: 400, width: 30, height: 30 },
      boundary: { top: 0, right: 469, bottom: 800, left: 50, width: 419, height: 800 },
      viewportWidth: 1000,
      viewportHeight: 800,
      overlayHeight: 360,
    });

    expect(position.placement).toBe("above");
    expect(position.width).toBe(320);
    expect(position.left).toBe(137);
    expect(position.left + position.width).toBeLessThanOrEqual(457);
    expect(position.top).toBeGreaterThanOrEqual(12);
  });

  it("renders a quiet document flow without role labels or a generic response toolbar", () => {
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
    expect(container.querySelector(".desktop-agent-message.is-user")?.getAttribute("data-message-surface")).toBe("row");
    expect(container.querySelector(".desktop-agent-message.is-assistant")?.getAttribute("data-message-surface")).toBe("document");
    expect(container.querySelector('button[aria-label="Copy response"]')).toBeNull();
  });

  it("renders one muted duration summary after a terminal Agent turn", () => {
    const projection = createAgentProjection();
    projection.messages = [{
      id: "assistant-duration",
      role: "assistant",
      turnId: "turn-duration",
      itemId: "message-duration",
      text: "Finished the requested work.",
      streaming: false,
      terminalState: "completed",
      sequence: 2,
    }];
    projection.turns = [{
      id: "turn-duration",
      status: "completed",
      startedAtSequence: 1,
      startedAtMs: 1_000,
      completedAtSequence: 3,
      durationMs: 62_000,
      partIds: ["assistant-duration"],
    }];

    const container = render(React.createElement(AgentTranscript, {
      projection,
      loading: false,
      runtimeLabel: "Codex",
    }));
    expect(container.querySelectorAll(".desktop-agent-turn-summary")).toHaveLength(1);
    expect(container.querySelector(".desktop-agent-turn-summary")?.textContent).toBe("Worked for 1m 2s");
  });

  it("distinguishes native session preparation from genuine Thinking and then yields to streaming text", () => {
    const preparing = createAgentProjection();
    expect(shouldShowAgentThinking(preparing, true)).toBe(false);
    expect(stripBidiIsolation(agentSubmissionStatusLabel("preparing-session", "Codex", testT))).toBe("Preparing Codex");
    expect(agentSubmissionStatusLabel("starting-turn", "Codex", testT)).toBe("Starting turn");

    const container = render(React.createElement(AgentTranscript, {
      projection: preparing,
      loading: false,
      working: true,
      pendingPrompt: "Please inspect this",
      submissionStage: "preparing-session",
      runtimeLabel: "Codex",
    }));
    expect(stripBidiIsolation(container.querySelector(".desktop-agent-working-indicator")?.getAttribute("aria-label"))).toBe("Preparing Codex");
    expect(container.textContent).not.toContain("Thinking");
    expect(container.querySelector(".desktop-agent-message.is-user")?.textContent).toContain("Please inspect this");

    const projection = createAgentProjection();
    projection.runningTurnId = "turn-live";
    projection.turns = [{ id: "turn-live", status: "running", startedAtSequence: 1, startedAtMs: 1_000, completedAtSequence: null, durationMs: null, partIds: [] }];
    expect(shouldShowAgentThinking(projection, true)).toBe(true);
    act(() => root?.render(withTestLocalization(React.createElement(AgentTranscript, { projection, loading: false, working: true, runtimeLabel: "Codex" }))));
    expect(stripBidiIsolation(container.querySelector(".desktop-agent-working-indicator")?.getAttribute("aria-label"))).toBe("Codex is thinking");

    const streaming = createAgentProjection();
    streaming.runningTurnId = "turn-live";
    streaming.turns = [{ id: "turn-live", status: "running", startedAtSequence: 1, startedAtMs: 1_000, completedAtSequence: null, durationMs: null, partIds: ["assistant:message-live"] }];
    streaming.messages = [{
      id: "assistant:message-live",
      role: "assistant",
      turnId: "turn-live",
      itemId: "message-live",
      text: "Streaming now",
      streaming: true,
      terminalState: null,
      sequence: 2,
    }];
    streaming.parts = [{ ...streaming.messages[0], kind: "assistant" }];
    streaming.rows = [{ id: "row:assistant:message-live", partId: "assistant:message-live", turnId: "turn-live", kind: "assistant", sequence: 2, estimatedHeight: 64 }];
    expect(shouldShowAgentThinking(streaming, true)).toBe(false);
    act(() => root?.render(withTestLocalization(React.createElement(AgentTranscript, { projection: streaming, loading: false, working: true, runtimeLabel: "Codex" }))));
    expect(container.querySelector(".desktop-agent-working-indicator")).toBeNull();
    expect(container.querySelector(".desktop-agent-stream-caret")).not.toBeNull();
  });

  it("leaves composer auto-sizing to CSS while controlled draft text changes", () => {
    const OriginalResizeObserver = globalThis.ResizeObserver;
    let constructions = 0;
    class StableResizeObserver {
      constructor(_callback: ResizeObserverCallback) { constructions += 1; }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = StableResizeObserver as unknown as typeof ResizeObserver;
    const props = {
      onDraftChange: vi.fn(),
      disabled: false,
      running: false,
      stopping: false,
      submitting: false,
      placeholder: "Ask anything",
      onSubmit: vi.fn(async () => true),
      onStop: vi.fn(),
    };
    try {
      const container = render(React.createElement(AgentComposer, { ...props, draft: "a" }));
      act(() => root?.render(withTestLocalization(React.createElement(AgentComposer, { ...props, draft: "ab" }))));
      act(() => root?.render(withTestLocalization(React.createElement(AgentComposer, { ...props, draft: "abc" }))));
      expect(constructions).toBe(0);
      expect(container.querySelector("textarea")?.getAttribute("style")).toBeNull();
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });

  it("keeps a useful placeholder when the caller supplies blank copy", () => {
    const container = render(React.createElement(AgentComposer, {
      draft: "",
      onDraftChange: vi.fn(),
      disabled: false,
      running: false,
      stopping: false,
      submitting: false,
      placeholder: "   ",
      onSubmit: vi.fn(async () => true),
      onStop: vi.fn(),
    }));

    expect((container.querySelector("textarea") as HTMLTextAreaElement).placeholder).toBe("Ask about this project");
  });

  it("hides the configured Model in Minimal Mode without removing the composer", () => {
    const container = render(React.createElement(AgentComposer, {
      draft: "Continue",
      onDraftChange: vi.fn(),
      disabled: false,
      hideConfiguration: true,
      running: false,
      stopping: false,
      submitting: false,
      placeholder: "Ask anything",
      models: [{ id: "gpt-5", model: "gpt-5", displayName: "GPT-5", description: "", isDefault: true }],
      selectedModel: "gpt-5",
      onSubmit: vi.fn(async () => true),
      onStop: vi.fn(),
    }));

    expect(container.querySelector('button[aria-label="Agent model"]')).toBeNull();
    expect(stripBidiIsolation(container.querySelector("textarea")?.getAttribute("aria-label"))).toBe("Message Agent");
    expect(container.querySelector('button[aria-label="Send message"]')).not.toBeNull();
  });

  it("keeps the session-level Provider in the header and only Model in the composer", () => {
    const provider = React.createElement(AgentProviderPicker, {
      agentProviders: [codingProvider("codex", "Codex")],
      selectedAgentProviderId: "codex",
      onSelectAgentProvider: vi.fn(),
    });
    const container = render(React.createElement("div", null,
      React.createElement(AgentSurfaceHeader, {
        title: "New chat",
        runtimeLabel: "Codex",
        statusCode: "ready",
        statusLabel: "ready",
        loading: false,
        newSessionDisabled: false,
        onNewSession: vi.fn(),
        agentSelector: provider,
      }),
      React.createElement(AgentComposer, {
        draft: "",
        onDraftChange: vi.fn(),
        disabled: false,
        running: false,
        stopping: false,
        submitting: false,
        placeholder: "Ask anything",
        models: [{ id: "gpt-5", model: "gpt-5", displayName: "GPT-5", description: "", isDefault: true }],
        selectedModel: "gpt-5",
        onSubmit: vi.fn(async () => true),
        onStop: vi.fn(),
      }),
    ));

    expect(container.querySelector("select")).toBeNull();
    const providerTrigger = container.querySelector('button[aria-label="Coding agent provider"]') as HTMLButtonElement;
    const composer = container.querySelector(".desktop-agent-composer") as HTMLElement;
    expect(container.querySelector('button[aria-label="Agent backend"]')).toBeNull();
    expect(providerTrigger.classList.contains("is-compact")).toBe(false);
    expect(providerTrigger.title).toContain("Switching provider starts a new chat");
    expect(providerTrigger.querySelector(".desktop-agent-brand-mark")).not.toBeNull();
    expect(providerTrigger.textContent).toContain("Codex");
    expect(composer.querySelector('button[aria-label="Coding agent provider"]')).toBeNull();
    expect(container.textContent).not.toContain("Google");
    expect(container.querySelector('button[aria-label="Agent model"]')?.textContent).toContain("GPT");
    expect(container.textContent).not.toContain("OpenCode runtime");
    expect(container.querySelector("textarea")?.getAttribute("rows")).toBe("1");
    expect(container.querySelector("textarea")?.getAttribute("style")).toBeNull();
    expect(container.querySelector(".desktop-agent-composer-row")).not.toBeNull();
    expect(container.querySelector(".desktop-agent-composer-input-row button[aria-label='Send message']")).toBeNull();
    expect(container.querySelector(".desktop-agent-composer-trailing button[aria-label='Send message']")).not.toBeNull();
    expect(container.querySelector(".desktop-agent-composer-trailing button[aria-label='Agent model']")).not.toBeNull();
    expect(container.querySelector('button[aria-label="Add context or change Agent mode"]')).toBeNull();
  });

  it("exposes only external Coding Agent products in the header Provider catalog", () => {
    const providers = listCodingAgentProviders({
      runtimes: [
        {
          descriptor: { id: "puppyone-agent", displayName: "PuppyOne Agent", distribution: "bundled" },
          readiness: { runtimeId: "puppyone-agent", provider: "puppyone-agent", status: "ready", version: "1.0.0", minimumVersion: null, message: "Ready" },
        },
        codingProvider("codex", "Codex"),
        codingProvider("claude", "Claude Code"),
        codingProvider("opencode-native", "OpenCode"),
        codingProvider("cursor", "Cursor Agent"),
      ],
      selectedRuntimeId: "puppyone-agent",
      runtime: { id: "puppyone-agent", displayName: "PuppyOne Agent", distribution: "bundled" },
      readiness: { runtimeId: "puppyone-agent", provider: "puppyone-agent", status: "ready", version: "1.0.0", minimumVersion: null, message: "Ready" },
      account: null,
      models: [],
      capabilities: null,
      warnings: [],
    });

    expect(providers.map((entry) => entry.descriptor.displayName)).toEqual([
      "Codex",
      "Claude Code",
      "OpenCode",
      "Cursor Agent",
    ]);
  });

  it("shows Provider in the header and withholds Model until a connected provider is selected", () => {
    const container = render(React.createElement("div", null,
      React.createElement(AgentSurfaceHeader, {
        title: "New chat",
        statusCode: "checking",
        statusLabel: "checking",
        loading: false,
        newSessionDisabled: true,
        onNewSession: vi.fn(),
        agentSelector: React.createElement(AgentProviderPicker, {
          agentProviders: [codingProvider("codex", "Codex"), codingProvider("claude", "Claude Code")],
          selectedAgentProviderId: null,
          onSelectAgentProvider: vi.fn(),
        }),
      }),
      React.createElement(AgentComposer, {
        draft: "Hello",
        onDraftChange: vi.fn(),
        disabled: true,
        running: false,
        stopping: false,
        submitting: false,
        placeholder: "Choose a provider to start",
        models: [],
        selectedModel: null,
        onSubmit: vi.fn(async () => false),
        onStop: vi.fn(),
      }),
    ));

    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector('button[aria-label="Coding agent provider"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Agent model"]')).toBeNull();
    expect(container.textContent).not.toContain("Agent model");
    expect((container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("updates the visible Provider and Model labels after pointer selection", () => {
    const catalogs = {
      codex: [
        { id: "gpt-5", model: "gpt-5", displayName: "GPT-5", description: "Native Codex model", isDefault: true },
      ],
      claude: [
        { id: "claude-sonnet", model: "claude-sonnet", displayName: "Claude Sonnet", description: "Native Claude Code model", isDefault: true },
        { id: "claude-opus", model: "claude-opus", displayName: "Claude Opus", description: "Native Claude Code model", isDefault: false },
      ],
    };

    function StatefulSurface() {
      const [provider, setProvider] = React.useState<keyof typeof catalogs>("codex");
      const [model, setModel] = React.useState(catalogs.codex[0].model);
      const models = catalogs[provider];
      const onSelectAgentProvider = (nextProvider: string) => {
          const typedProvider = nextProvider as keyof typeof catalogs;
          setProvider(typedProvider);
          setModel(catalogs[typedProvider][0].model);
      };
      return React.createElement("div", null,
        React.createElement(AgentSurfaceHeader, {
          title: "New chat",
          runtimeLabel: provider,
          statusCode: "ready",
          statusLabel: "ready",
          loading: false,
          newSessionDisabled: false,
          onNewSession: vi.fn(),
          agentSelector: React.createElement(AgentProviderPicker, {
            agentProviders: [codingProvider("codex", "Codex"), codingProvider("claude", "Claude Code")],
            selectedAgentProviderId: provider,
            onSelectAgentProvider,
          }),
        }),
        React.createElement(AgentComposer, {
          draft: "",
          onDraftChange: vi.fn(),
          disabled: false,
          running: false,
          stopping: false,
          submitting: false,
          placeholder: "Ask anything",
          models,
          selectedModel: model,
          onSelectModel: setModel,
          onSubmit: vi.fn(async () => true),
          onStop: vi.fn(),
        }),
      );
    }

    const container = render(React.createElement(StatefulSurface));
    const providerTrigger = container.querySelector('button[aria-label="Coding agent provider"]') as HTMLButtonElement;
    expect(providerTrigger.textContent).toContain("Codex");
    act(() => providerTrigger.click());
    const claude = Array.from(document.querySelectorAll('[role="option"]'))
      .find((option) => option.textContent?.includes("Claude Code")) as HTMLButtonElement;
    act(() => claude.click());
    expect(providerTrigger.textContent).toContain("Claude Code");

    const modelTrigger = container.querySelector('button[aria-label="Agent model"]') as HTMLButtonElement;
    expect(modelTrigger.textContent).toContain("Claude Sonnet");
    act(() => modelTrigger.click());
    const opus = Array.from(document.querySelectorAll('[role="option"]'))
      .find((option) => option.textContent?.includes("Claude Opus")) as HTMLButtonElement;
    act(() => opus.click());
    expect(modelTrigger.textContent).toContain("Claude Opus");
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
    const overlay = document.querySelector(".desktop-agent-picker-popover") as HTMLElement;
    expect(overlay.closest("#desktop-overlay-root")).not.toBeNull();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(overlay.querySelectorAll('[role="option"]')).toHaveLength(agentPickerLimits.maxRenderedOptions);
    expect(overlay.textContent).toContain("Showing 120 of 500");

    const input = overlay.querySelector<HTMLInputElement>('.desktop-agent-picker-search input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Model 499");
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Model 499" }));
    });
    expect(overlay.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(overlay.textContent).toContain("Model 499");
  });

  it("renders one flat coding-Agent menu and keeps detected runtimes selectable with one warning", () => {
    const onSelectRuntime = vi.fn();
    const container = render(React.createElement(AgentProviderPicker, {
      agentProviders: [
        {
          descriptor: { id: "codex", displayName: "Codex", iconKey: "codex", distribution: "user-installed" },
          readiness: { runtimeId: "codex", provider: "codex", status: "ready", version: "0.144.1", minimumVersion: null, message: "Native login ready", selectable: true },
        },
        {
          descriptor: { id: "cursor", displayName: "Cursor Agent", iconKey: "cursor", distribution: "user-installed" },
          readiness: { runtimeId: "cursor", provider: "cursor", status: "protocol-unavailable", version: "1.0.0", minimumVersion: null, message: "Native protocol unavailable", selectable: false },
        },
      ],
      selectedAgentProviderId: null,
      onSelectAgentProvider: onSelectRuntime,
    }));

    const trigger = container.querySelector('button[aria-label="Coding agent provider"]') as HTMLButtonElement;
    act(() => trigger.click());
    const popup = document.querySelector(".desktop-agent-picker-list[role='listbox']") as HTMLElement;
    expect(popup).not.toBeNull();
    expect((popup.closest(".desktop-agent-picker-popover") as HTMLElement).dataset.positioned).toBe("true");
    expect(popup.textContent).not.toContain("Coding Agents");
    expect(popup.textContent).not.toContain("Detected");
    expect(popup.textContent).not.toContain("Refresh");
    expect(popup.querySelectorAll('[role="group"]')).toHaveLength(0);
    const cursor = Array.from(popup.querySelectorAll('[role="option"]')).find((option) => option.textContent?.includes("Cursor Agent")) as HTMLButtonElement;
    expect(cursor.getAttribute("aria-disabled")).toBeNull();
    expect(cursor.querySelector(".desktop-agent-picker-warning")).not.toBeNull();
    expect(cursor.querySelector(".desktop-agent-picker-warning")?.getAttribute("title")).toContain("Native protocol unavailable");
    expect(popup.textContent).not.toContain("Native protocol unavailable");
    act(() => cursor.click());
    expect(onSelectRuntime).toHaveBeenCalledWith("cursor");
    expect(document.querySelector('[role="listbox"][aria-label="Coding agent provider options"]')).toBeNull();
  });

  it("supports Arrow, Enter and Escape with focus return in the custom Provider picker", async () => {
    const onSelectAgentProvider = vi.fn();
    const container = render(React.createElement(AgentProviderPicker, {
      agentProviders: [
        codingProvider("codex", "Codex"),
        codingProvider("claude", "Claude Code"),
      ],
      selectedAgentProviderId: null,
      onSelectAgentProvider,
    }));
    const trigger = container.querySelector('button[aria-label="Coding agent provider"]') as HTMLButtonElement;
    act(() => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect((document.activeElement as HTMLElement).textContent).toContain("Codex");
    act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect((document.activeElement as HTMLElement).textContent).toContain("Claude Code");
    act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(onSelectAgentProvider).toHaveBeenCalledWith("claude");
    expect(document.activeElement).toBe(trigger);

    act(() => trigger.click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="listbox"][aria-label="Coding agent provider options"]')).toBeNull();
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

  it("renders Bash activity as a compact product row with a bounded expandable transcript", () => {
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
    const container = render(React.createElement(AgentTranscript, { projection, loading: false }));
    const row = container.querySelector(".desktop-agent-tool-row") as HTMLButtonElement;
    expect(row.textContent).toContain("Bash");
    expect(row.textContent).toContain("npm test");
    expect(row.querySelector(".desktop-agent-tool-name")?.nextElementSibling).toBe(row.querySelector(".desktop-agent-tool-chevron"));
    expect(row.querySelector(".desktop-agent-tool-chevron")?.nextElementSibling).toBe(row.querySelector(".desktop-agent-tool-summary"));
    expect(row.getAttribute("aria-expanded")).toBe("false");
    act(() => row.click());
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".desktop-agent-command-line")?.textContent).toContain("$npm test");
    expect(container.querySelector(".desktop-agent-command-output")?.textContent).toContain("25 files passed");
    expect(row.textContent).not.toContain("Exit 0");
    expect(row.textContent).not.toMatch(/\d+\s*ms/u);
    expect(container.querySelector(".desktop-agent-command-meta")).toBeNull();
    expect(container.querySelector('button[aria-label="Open command in terminal"]')).toBeNull();
    expect(container.querySelector('button[aria-label*="Copy"]')).toBeNull();
  });

  it("presents conservative read-only shell commands semantically without collapsed provenance noise", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "command-search",
      turnId: "turn-1",
      itemId: "tool-search",
      kind: "command",
      label: "Search repository",
      status: "completed",
      output: "src/App.tsx:12:liangyu",
      detail: {
        tool: "bash",
        command: "/bin/zsh -lc \"rg -n -i liangyu src\"",
        exitCode: 0,
      },
      sequence: 1,
    });
    const container = render(React.createElement(AgentTranscript, { projection, loading: false }));
    const row = container.querySelector(".desktop-agent-tool-row") as HTMLButtonElement;
    expect(row.textContent).toContain("Grep");
    expect(row.textContent).toContain("rg -n -i liangyu src");
    expect(row.textContent).not.toContain("via Bash");
    expect(row.textContent).not.toContain("Exit 0");
    expect(container.querySelector(".desktop-agent-command.is-grep")).not.toBeNull();
  });

  it("renders native Grep as a dedicated bounded result disclosure", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "grep-1",
      turnId: "turn-1",
      itemId: "tool-grep",
      kind: "tool",
      label: "Find liangyu",
      status: "completed",
      output: "src/a.ts:3:liangyu\nsrc/b.ts:8:LIANGYU",
      detail: { tool: "grep", input: { pattern: "liangyu", path: "src" } },
      sequence: 1,
    });
    const onOpenFile = vi.fn();
    const container = render(React.createElement(AgentTranscript, { projection, loading: false, onOpenFile }));
    const row = container.querySelector(".desktop-agent-tool-row") as HTMLButtonElement;
    expect(row.textContent).toContain("Grep");
    expect(row.textContent).toContain("liangyu");
    act(() => row.click());
    expect(container.querySelectorAll(".desktop-agent-search-results > button")).toHaveLength(2);
    act(() => (container.querySelector(".desktop-agent-search-results > button") as HTMLButtonElement).click());
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts");
  });

  it("renders Write/Edit activity with file stats and inline diff lines without row action clutter", () => {
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
    const onOpenFile = vi.fn();
    const container = render(React.createElement(AgentTranscript, { projection, loading: false, onOpenFile }));
    const row = container.querySelector(".desktop-agent-tool-row") as HTMLButtonElement;
    expect(row.textContent).toContain("Edit");
    expect(row.textContent).toContain("src/app.ts");
    act(() => row.click());
    expect(container.querySelectorAll(".desktop-agent-diff-line.is-addition")).toHaveLength(1);
    expect(container.querySelectorAll(".desktop-agent-diff-line.is-deletion")).toHaveLength(1);
    expect(container.textContent).toContain("+2");
    expect(container.querySelector('button[aria-label="Review file changes"]')).toBeNull();
    act(() => (container.querySelector('.desktop-agent-file-list button[title="src/app.ts"]') as HTMLButtonElement).click());
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
    const container = render(React.createElement(AgentTranscript, { projection, loading: false }));
    expect(container.textContent).not.toContain("File Change");
    expect(container.querySelector('button[aria-label="Review file changes"]')).toBeNull();
  });

  it("keeps Read activity compact and reveals output without a redundant row action", () => {
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
    const row = container.querySelector(".desktop-agent-tool-row") as HTMLButtonElement;
    expect(row.textContent).toContain("Read");
    act(() => row.click());
    expect(container.querySelector(".desktop-agent-tool-output")?.textContent).toContain("export function AgentComposer");
    expect(container.querySelector('button[aria-label^="Open"]')).toBeNull();
    expect(onOpenFile).not.toHaveBeenCalled();
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

  it("renders context compaction as a divider instead of a generic Tool timeline row", () => {
    const projection = createAgentProjection();
    projection.activities.push({
      id: "compact-1",
      turnId: "turn-1",
      itemId: "compact",
      kind: "tool",
      label: "Compacted context",
      status: "completed",
      output: "",
      detail: { tool: "compaction" },
      sequence: 1,
    });
    const container = render(React.createElement(AgentTranscript, { projection, loading: false }));
    expect(container.querySelector(".desktop-agent-context-divider")?.textContent).toContain("Compacted context");
    expect(container.querySelector(".desktop-agent-tool-call")).toBeNull();
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
    const jump = container.querySelector(".desktop-agent-jump-latest") as HTMLButtonElement;
    expect(jump.textContent).toBe("");
    expect(jump.getAttribute("aria-label")).toContain("Jump to latest");
    expect(jump.querySelector("svg")).not.toBeNull();
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
