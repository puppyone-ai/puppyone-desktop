/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopTitlebarActions } from "../src/features/app-shell/DesktopTitlebarActions";
import { TerminalCloseConfirmationDialog } from "../src/features/desktop-terminal/ui/TerminalCloseConfirmationDialog";
import type { TerminalRuntimeHandle } from "../src/features/desktop-terminal/runtime/terminalRuntime";
import { TerminalSessionHeader } from "../src/features/desktop-terminal/ui/session-header/TerminalSessionHeader";
import { TERMINAL_SESSION_ACTIVATION_MOTION_MS } from "../src/features/desktop-terminal/ui/session-header/useTerminalSessionHeaderController";
import { DEFAULT_TITLEBAR_ACTIONS_SETTINGS } from "../src/preferences";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Desktop Terminal titlebar session manager", () => {
  it("presents the terminal launcher as Agent in the workspace toolbar", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <DesktopTitlebarActions
        titlebarActionsSettings={DEFAULT_TITLEBAR_ACTIONS_SETTINGS}
        terminalSidebarOpen={false}
        terminalToolEnabled
        terminalSessionLayout="menu"
        terminalSessions={[]}
        activeTerminalSessionId={null}
        agentChatEnabled
        agentChatSidebarOpen={false}
        placement="toolbar"
        visibleGroups={["right-sidebar"]}
        onCreateTerminal={vi.fn()}
        onActivateTerminal={vi.fn()}
        onCloseTerminal={vi.fn()}
        onToggleAgentChat={vi.fn()}
        onToggleTerminal={vi.fn()}
      />,
    )));

    const terminal = container.querySelector('[data-toolbar-action="terminal"]');
    const agent = container.querySelector('[data-toolbar-action="agent"]');
    expect(terminal?.textContent).toBe("Agent");
    expect(terminal?.classList.contains("desktop-shell-toolbar-button")).toBe(true);
    expect(terminal?.classList.contains("desktop-titlebar-action")).toBe(false);
    expect(terminal?.querySelector(".lucide-square-terminal")).not.toBeNull();
    expect(terminal?.querySelector(".desktop-shell-toolbar-button-icon")).not.toBeNull();
    expect(terminal?.querySelector(".desktop-shell-toolbar-button-label")).not.toBeNull();
    expect(agent?.textContent).toBe("Chat");
    expect(agent?.classList.contains("desktop-shell-toolbar-button")).toBe(true);
    expect(agent?.classList.contains("desktop-titlebar-action")).toBe(false);
    expect(agent?.querySelector(".desktop-shell-toolbar-agent-logo")).not.toBeNull();
    expect(agent?.querySelector(".desktop-shell-toolbar-button-icon")).not.toBeNull();
    expect(agent?.querySelector(".desktop-shell-toolbar-button-label")).not.toBeNull();
    expect(Array.from(container.querySelectorAll("[data-toolbar-action]"), (item) => item.textContent))
      .toEqual(["Chat", "Agent"]);
  });

  it("lets the user create, switch, and close explicit terminal sessions", () => {
    const onCreateTerminal = vi.fn();
    const onActivateTerminal = vi.fn();
    const onCloseTerminal = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <DesktopTitlebarActions
        titlebarActionsSettings={DEFAULT_TITLEBAR_ACTIONS_SETTINGS}
        terminalSidebarOpen
        terminalToolEnabled
        terminalSessionLayout="menu"
        terminalSessions={[
          { id: "terminal-a", ordinal: 1, shell: "zsh", status: "running" },
          { id: "terminal-b", ordinal: 2, shell: null, status: "exited" },
        ]}
        activeTerminalSessionId="terminal-a"
        agentChatEnabled={false}
        agentChatSidebarOpen={false}
        onCreateTerminal={onCreateTerminal}
        onActivateTerminal={onActivateTerminal}
        onCloseTerminal={onCloseTerminal}
        onToggleAgentChat={vi.fn()}
        onToggleTerminal={vi.fn()}
      />,
    )));

    openTerminalMenu(container);
    expect(container.querySelectorAll(".desktop-menu-separator")).toHaveLength(1);
    expect(container.textContent).not.toContain("Open terminals");
    expect(container.textContent).not.toContain("Restart");
    expect(container.textContent).toContain("zsh");
    expect(container.textContent).toContain("Running");
    expect(container.textContent).toContain("Exited");
    expect(container.textContent).not.toContain("Terminal 1");
    expect(container.textContent).not.toContain("Terminal 2");
    expect(container.querySelector('[role="menuitemradio"][aria-checked="true"]')?.textContent)
      .toContain("zsh");

    clickButton(container, "Close Terminal 2");
    expect(onCloseTerminal).toHaveBeenCalledWith("terminal-b");
    expect(container.querySelector('[role="menu"]')).toBeNull();

    openTerminalMenu(container);
    clickButton(container, "Terminal 2 — Exited");
    expect(onActivateTerminal).toHaveBeenCalledWith("terminal-b");
    expect(container.querySelector('[role="menu"]')).toBeNull();

    openTerminalMenu(container);
    clickButton(container, "New terminal");
    expect(onCreateTerminal).toHaveBeenCalledOnce();

  });

  it("moves session management into the Terminal subheader in tabs mode", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    const onCreate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalSessionHeader
        sessions={[
          { id: "terminal-a", launcherId: "codex", ordinal: 1, shell: "Codex", status: "running" },
          { id: "terminal-b", launcherId: "shell", ordinal: 2, shell: null, status: "exited" },
        ]}
        activeSessionId="terminal-a"
        onActivate={onActivate}
        onClose={onClose}
        onCreate={onCreate}
        workspacePath="/workspace/my private"
      />,
    )));

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-label"))
      .toContain("Terminal 1 — Codex — /workspace/my private — Running");
    expect(tabs[1]?.getAttribute("aria-label"))
      .toContain("Terminal 2 — Open a shell — /workspace/my private — Exited");
    expect(tabs[0]?.textContent).toBe("my private");
    expect(tabs[1]?.textContent).toBe("my private");
    expect(tabs[0]?.querySelector(".desktop-terminal-launcher-icon.is-codex")).not.toBeNull();

    act(() => tabs[1]?.click());
    expect(onActivate).toHaveBeenCalledWith("terminal-b");

    clickButton(container, "Close Terminal 2");
    expect(onClose).toHaveBeenCalledWith("terminal-b");

    clickButton(container, "New terminal");
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("keeps roving-tab keyboard navigation on the complete session order", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    function Harness() {
      const [activeSessionId, setActiveSessionId] = React.useState("terminal-b");
      return (
        <TerminalSessionHeader
          sessions={[
            { id: "terminal-a", launcherId: "codex", ordinal: 1, shell: "codex", status: "running" },
            { id: "terminal-b", launcherId: "claude", ordinal: 2, shell: "claude", status: "running" },
            { id: "terminal-c", launcherId: "cursor", ordinal: 3, shell: "cursor", status: "running" },
          ]}
          activeSessionId={activeSessionId}
          onActivate={setActiveSessionId}
          onClose={vi.fn()}
          onCreate={vi.fn()}
          workspacePath="/workspace/my private"
        />
      );
    }

    act(() => root?.render(withTestLocalization(<Harness />)));
    const selectedTab = () => container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');

    act(() => selectedTab()?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "End",
    })));
    expect(selectedTab()?.id).toBe("desktop-terminal-tab-terminal-c");

    act(() => selectedTab()?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Home",
    })));
    expect(selectedTab()?.id).toBe("desktop-terminal-tab-terminal-a");

    act(() => selectedTab()?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "ArrowLeft",
    })));
    expect(selectedTab()?.id).toBe("desktop-terminal-tab-terminal-c");
  });

  it("labels a runtime-free launcher tab without requiring a Terminal runtime", () => {
    const requireRuntime = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalSessionHeader
        sessions={[{
          id: "launcher-a",
          launcherId: null,
          ordinal: 1,
          shell: null,
          status: "selecting",
        }]}
        activeSessionId="launcher-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        runtimeRegistry={{ require: requireRuntime }}
        workspacePath="/workspace/my private"
      />,
    )));

    expect(container.querySelector('[role="tab"]')?.textContent).toBe("my private");
    expect(requireRuntime).not.toHaveBeenCalled();
  });

  it("compresses inactive tabs and moves excess sessions into an accessible menu", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 281,
      height: 38,
      top: 0,
      right: 281,
      bottom: 38,
      left: 0,
      toJSON: () => ({}),
    });
    const onActivate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const launchers = ["codex", "claude", "cursor", "opencode", "pi", "hermes"] as const;

    act(() => root?.render(withTestLocalization(
      <TerminalSessionHeader
        sessions={launchers.map((launcherId, index) => ({
          id: `terminal-${index + 1}`,
          launcherId,
          ordinal: index + 1,
          shell: launcherId,
          status: "running" as const,
        }))}
        activeSessionId="terminal-4"
        onActivate={onActivate}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        workspacePath="/workspace/my private"
      />,
    )));

    expect(container.querySelector(".desktop-terminal-tab-rail")?.getAttribute("data-layout"))
      .toBe("overflow");
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(container.querySelectorAll(".desktop-terminal-tab.is-compact")).toHaveLength(3);
    expect(container.querySelector(".desktop-terminal-tab.is-active")?.textContent)
      .toBe("my private");

    clickButton(container, "More terminal tabs (2)");
    expect(document.querySelectorAll('.desktop-terminal-tab-overflow-menu [role="menuitemradio"]'))
      .toHaveLength(2);
    clickButton(document.body, "Codex");
    expect(onActivate).toHaveBeenCalledWith("terminal-1");
    expect(document.querySelector(".desktop-terminal-tab-overflow-menu")).toBeNull();
  });

  it("measures stable Header capacity and expands from overflow back to full tabs", () => {
    let headerWidth = 281;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: 0,
      width: headerWidth,
      height: 38,
      top: 0,
      right: headerWidth,
      bottom: 38,
      left: 0,
      toJSON: () => ({}),
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const launchers = ["codex", "claude", "cursor", "opencode", "pi", "hermes"] as const;

    act(() => root?.render(withTestLocalization(
      <TerminalSessionHeader
        sessions={launchers.map((launcherId, index) => ({
          id: `terminal-${index + 1}`,
          launcherId,
          ordinal: index + 1,
          shell: launcherId,
          status: "running" as const,
        }))}
        activeSessionId="terminal-4"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        workspacePath="/workspace/my private"
      />,
    )));

    const rail = container.querySelector(".desktop-terminal-tab-rail");
    expect(rail?.getAttribute("data-layout")).toBe("overflow");

    headerWidth = 931;
    act(() => window.dispatchEvent(new Event("resize")));

    expect(rail?.getAttribute("data-layout")).toBe("full");
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(6);
    expect(container.querySelectorAll(".desktop-terminal-tab.is-compact")).toHaveLength(0);
    expect(container.querySelector(".desktop-terminal-tab-overflow-trigger")).toBeNull();
  });

  it("animates an explicit compact-tab activation without animating steady layout", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 300,
      height: 38,
      top: 0,
      right: 300,
      bottom: 38,
      left: 0,
      toJSON: () => ({}),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    function Harness() {
      const [activeSessionId, setActiveSessionId] = React.useState("terminal-a");
      return (
        <TerminalSessionHeader
          sessions={[
            { id: "terminal-a", launcherId: "codex", ordinal: 1, shell: "codex", status: "running" },
            { id: "terminal-b", launcherId: "claude", ordinal: 2, shell: "claude", status: "running" },
            { id: "terminal-c", launcherId: "cursor", ordinal: 3, shell: "cursor", status: "running" },
          ]}
          activeSessionId={activeSessionId}
          onActivate={setActiveSessionId}
          onClose={vi.fn()}
          onCreate={vi.fn()}
          workspacePath="/workspace/my private"
        />
      );
    }

    act(() => root?.render(withTestLocalization(<Harness />)));
    const rail = container.querySelector(".desktop-terminal-tab-rail");
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const tabShells = container.querySelectorAll<HTMLElement>(".desktop-terminal-tab");
    expect(rail?.getAttribute("data-layout")).toBe("compact");
    expect(rail?.hasAttribute("data-activation-motion")).toBe(false);
    expect(tabShells[0]?.style.getPropertyValue("--desktop-terminal-tab-inline-start")).toBe("0px");
    expect(tabShells[0]?.style.getPropertyValue("--desktop-terminal-tab-resolved-width")).toBe("144px");
    expect(tabShells[1]?.style.getPropertyValue("--desktop-terminal-tab-inline-start")).toBe("147px");
    expect(tabShells[1]?.style.getPropertyValue("--desktop-terminal-tab-resolved-width")).toBe("28px");

    act(() => tabs[1]?.click());
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(rail?.getAttribute("data-activation-motion")).toBe("true");
    expect(tabShells[0]?.style.getPropertyValue("--desktop-terminal-tab-inline-start")).toBe("0px");
    expect(tabShells[0]?.style.getPropertyValue("--desktop-terminal-tab-resolved-width")).toBe("28px");
    expect(tabShells[1]?.style.getPropertyValue("--desktop-terminal-tab-inline-start")).toBe("31px");
    expect(tabShells[1]?.style.getPropertyValue("--desktop-terminal-tab-resolved-width")).toBe("144px");

    act(() => vi.advanceTimersByTime(TERMINAL_SESSION_ACTIVATION_MOTION_MS));
    expect(rail?.hasAttribute("data-activation-motion")).toBe(false);
  });

  it("keeps visible overflow tabs mounted while the active width pushes across the rail", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 281,
      height: 38,
      top: 0,
      right: 281,
      bottom: 38,
      left: 0,
      toJSON: () => ({}),
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const sessions = ["codex", "claude", "cursor", "opencode", "pi", "hermes"]
      .map((launcherId, index) => ({
        id: `terminal-${index + 1}`,
        launcherId,
        ordinal: index + 1,
        shell: launcherId,
        status: "running" as const,
      }));

    function Harness() {
      const [activeSessionId, setActiveSessionId] = React.useState("terminal-4");
      return (
        <TerminalSessionHeader
          sessions={sessions}
          activeSessionId={activeSessionId}
          onActivate={setActiveSessionId}
          onClose={vi.fn()}
          onCreate={vi.fn()}
          workspacePath="/workspace/my private"
        />
      );
    }

    act(() => root?.render(withTestLocalization(<Harness />)));
    const before = [...container.querySelectorAll<HTMLElement>(".desktop-terminal-tab")];
    expect(before.map((tab) => tab.querySelector('[role="tab"]')?.id)).toEqual([
      "desktop-terminal-tab-terminal-2",
      "desktop-terminal-tab-terminal-3",
      "desktop-terminal-tab-terminal-4",
      "desktop-terminal-tab-terminal-5",
    ]);

    act(() => container.querySelector<HTMLButtonElement>("#desktop-terminal-tab-terminal-5")?.click());
    const after = [...container.querySelectorAll<HTMLElement>(".desktop-terminal-tab")];
    expect(after).toEqual(before);
    expect(after[2]?.classList.contains("is-compact")).toBe(true);
    expect(after[3]?.classList.contains("is-active")).toBe(true);
    expect(container.querySelector(".desktop-terminal-tab-rail")?.getAttribute("data-activation-motion"))
      .toBe("true");
  });

  it("uses one activity grid for every Agent while preserving its idle brand mark", () => {
    const activityHarness = createTerminalActivityHarness();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalSessionHeader
        sessions={[
          { id: "terminal-a", launcherId: "cursor", ordinal: 1, shell: "Cursor Agent", status: "running" },
        ]}
        activeSessionId="terminal-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        runtimeRegistry={{ require: () => activityHarness.runtime }}
        workspacePath="/workspace/my private"
      />,
    )));

    const status = container.querySelector(".desktop-terminal-tab-status");
    expect(status?.querySelector(".desktop-terminal-launcher-icon.is-cursor")).not.toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(false);
    expect(status?.querySelectorAll(".desktop-terminal-activity-grid > span")).toHaveLength(0);

    activityHarness.setActivity(true);
    expect(status?.querySelector(".desktop-terminal-launcher-icon")).toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(true);
    expect(status?.querySelectorAll(".desktop-terminal-activity-grid > span")).toHaveLength(4);

    activityHarness.setActivity(false);
    expect(status?.querySelector(".desktop-terminal-launcher-icon.is-cursor")).not.toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(false);
    expect(status?.querySelectorAll(".desktop-terminal-activity-grid > span")).toHaveLength(0);

    act(() => root?.render(withTestLocalization(
      <TerminalSessionHeader
        sessions={[
          { id: "terminal-a", launcherId: "cursor", ordinal: 1, shell: null, status: "starting" },
        ]}
        activeSessionId="terminal-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        runtimeRegistry={{ require: () => activityHarness.runtime }}
        workspacePath="/workspace/my private"
      />,
    )));
    expect(status?.querySelector(".desktop-terminal-launcher-icon")).toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(true);
    expect(status?.querySelectorAll(".desktop-terminal-activity-grid > span")).toHaveLength(4);

    activityHarness.setActivity(true);
    act(() => root?.render(withTestLocalization(
      <TerminalSessionHeader
        sessions={[
          { id: "terminal-a", launcherId: "cursor", ordinal: 1, shell: "Cursor Agent", status: "exited" },
        ]}
        activeSessionId="terminal-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        runtimeRegistry={{ require: () => activityHarness.runtime }}
        workspacePath="/workspace/my private"
      />,
    )));
    expect(status?.querySelector(".desktop-terminal-launcher-icon.is-cursor")).not.toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(false);
  });

  it("makes cancellation the safe default before closing a terminal", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalCloseConfirmationDialog
        title="Terminal 2"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )));

    const overlayRoot = document.querySelector<HTMLElement>("#desktop-overlay-root");
    const dialog = overlayRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(overlayRoot).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog?.getAttribute("aria-label")).toBe("Close Terminal 2?");
    expect(dialog?.textContent).toContain(
      "This will stop the shell and any command running in this terminal.",
    );
    expect(document.activeElement?.textContent).toBe("Cancel");

    clickButton(overlayRoot!, "Cancel");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    clickButton(overlayRoot!, "Close terminal");
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

function openTerminalMenu(container: HTMLElement) {
  clickButton(container, "Terminal actions");
  expect(container.querySelector('[role="menu"]')).not.toBeNull();
}

function clickButton(container: HTMLElement, accessibleName: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${accessibleName}"]`)
    ?? Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((candidate) => candidate.textContent?.trim().startsWith(accessibleName));
  if (!button) throw new Error(`Button not found: ${accessibleName}`);
  act(() => button.click());
}

function createTerminalActivityHarness() {
  let activity = false;
  const listeners = new Set<(nextActivity: boolean) => void>();
  const runtime: TerminalRuntimeHandle = {
    get activity() {
      return activity;
    },
    ready: true,
    scrollbarState: {
      visible: false,
      canDecrement: false,
      canIncrement: false,
      position: 0,
      viewportRatio: 1,
    },
    applyAppearance: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    mount: vi.fn(),
    scrollLines: vi.fn(),
    scrollToRatio: vi.fn(),
    unmount: vi.fn(),
    setActive: vi.fn(),
    subscribeActivity: vi.fn((listener) => {
      listeners.add(listener);
      listener(activity);
      return () => listeners.delete(listener);
    }),
    subscribeReady: vi.fn(() => () => undefined),
    subscribeScrollbar: vi.fn(() => () => undefined),
    write: vi.fn(),
  };

  return {
    runtime,
    setActivity(nextActivity: boolean) {
      activity = nextActivity;
      act(() => listeners.forEach((listener) => listener(activity)));
    },
  };
}
