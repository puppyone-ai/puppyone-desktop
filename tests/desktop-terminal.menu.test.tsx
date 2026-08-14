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
import { TerminalSessionTabs } from "../src/features/desktop-terminal/ui/TerminalSessionTabs";
import { DEFAULT_TITLEBAR_ACTIONS_SETTINGS } from "../src/preferences";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Desktop Terminal titlebar session manager", () => {
  it("lets the user create, switch, and close explicit terminal sessions", () => {
    const onCreateTerminal = vi.fn();
    const onActivateTerminal = vi.fn();
    const onCloseTerminal = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <DesktopTitlebarActions
        canOpenActiveFileExternal={false}
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
        onOpenActiveFileExternal={vi.fn()}
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
      <TerminalSessionTabs
        sessions={[
          { id: "terminal-a", ordinal: 1, shell: "zsh", status: "running" },
          { id: "terminal-b", ordinal: 2, shell: null, status: "exited" },
        ]}
        activeSessionId="terminal-a"
        onActivate={onActivate}
        onClose={onClose}
        onCreate={onCreate}
      />,
    )));

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-label")).toContain("Terminal 1 — zsh");
    expect(tabs[1]?.getAttribute("aria-label")).toContain("Terminal 2 — Exited");
    expect(tabs[0]?.textContent).toBe("zsh");
    expect(tabs[1]?.textContent).toBe("Exited");

    act(() => tabs[1]?.click());
    expect(onActivate).toHaveBeenCalledWith("terminal-b");

    clickButton(container, "Close Terminal 2");
    expect(onClose).toHaveBeenCalledWith("terminal-b");

    clickButton(container, "New terminal");
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("labels a runtime-free launcher tab without requiring a Terminal runtime", () => {
    const requireRuntime = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalSessionTabs
        sessions={[{
          id: "launcher-a",
          ordinal: 1,
          shell: null,
          status: "selecting",
        }]}
        activeSessionId="launcher-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        runtimeRegistry={{ require: requireRuntime }}
      />,
    )));

    expect(container.querySelector('[role="tab"]')?.textContent).toBe("Start an Agent");
    expect(requireRuntime).not.toHaveBeenCalled();
  });

  it("replaces the always-on running dot with terminal-reported activity frames", () => {
    const titleHarness = createTerminalTitleHarness();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalSessionTabs
        sessions={[
          { id: "terminal-a", ordinal: 1, shell: "zsh", status: "running" },
        ]}
        activeSessionId="terminal-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        runtimeRegistry={{ require: () => titleHarness.runtime }}
      />,
    )));

    const status = container.querySelector(".desktop-terminal-tab-status");
    expect(status?.querySelector(".desktop-terminal-tab-idle-mark")).not.toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(false);
    expect(status?.querySelectorAll(".desktop-terminal-tab-activity-dot")).toHaveLength(0);

    titleHarness.setTitle("⠋ puppyone");
    expect(status?.querySelector(".desktop-terminal-tab-idle-mark")).toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(true);
    expect(status?.querySelectorAll(".desktop-terminal-tab-activity-dot")).toHaveLength(4);

    titleHarness.setTitle("✳ puppyone");
    expect(status?.querySelector(".desktop-terminal-tab-idle-mark")).not.toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(false);
    expect(status?.querySelectorAll(".desktop-terminal-tab-activity-dot")).toHaveLength(0);

    titleHarness.setTitle("⠙ puppyone");
    act(() => root?.render(withTestLocalization(
      <TerminalSessionTabs
        sessions={[
          { id: "terminal-a", ordinal: 1, shell: "zsh", status: "exited" },
        ]}
        activeSessionId="terminal-a"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        runtimeRegistry={{ require: () => titleHarness.runtime }}
      />,
    )));
    expect(status?.textContent).toBe("");
    expect(status?.querySelector(".desktop-terminal-tab-idle-mark")).toBeNull();
    expect(status?.classList.contains("is-activity")).toBe(false);
    expect(status?.querySelectorAll(".desktop-terminal-tab-activity-dot")).toHaveLength(0);
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

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Close Terminal 2?");
    expect(dialog?.textContent).toContain(
      "This will stop the shell and any command running in this terminal.",
    );
    expect(document.activeElement?.textContent).toBe("Cancel");

    clickButton(container, "Cancel");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    clickButton(container, "Close terminal");
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

function createTerminalTitleHarness() {
  let title = "";
  const listeners = new Set<(nextTitle: string) => void>();
  const runtime: TerminalRuntimeHandle = {
    get title() {
      return title;
    },
    ready: true,
    applyAppearance: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    mount: vi.fn(),
    setActive: vi.fn(),
    subscribeReady: vi.fn(() => () => undefined),
    subscribeTitle: vi.fn((listener) => {
      listeners.add(listener);
      listener(title);
      return () => listeners.delete(listener);
    }),
    write: vi.fn(),
  };

  return {
    runtime,
    setTitle(nextTitle: string) {
      title = nextTitle;
      act(() => listeners.forEach((listener) => listener(title)));
    },
  };
}
