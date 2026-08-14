/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DESKTOP_TERMINAL_LAUNCHERS,
  getDesktopTerminalLauncher,
} from "../src/features/desktop-terminal/model/terminalLaunchers";
import { TerminalLauncher } from "../src/features/desktop-terminal/ui/TerminalLauncher";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Desktop Terminal launcher", () => {
  it("presents installed Agents without starting a session before selection", () => {
    const onLaunch = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalLauncher
        discoveryPhase="ready"
        installedAgentIds={["codex", "claude", "cursor", "opencode"]}
        onLaunch={onLaunch}
        onRefresh={vi.fn()}
      />,
    )));

    expect(container.querySelector(".desktop-terminal-launcher")).not.toBeNull();
    expect(container.textContent).toContain("Start an Agent");
    expect(container.textContent).toContain("Codex");
    expect(container.textContent).toContain("Claude Code");
    expect(container.textContent).toContain("Cursor Agent");
    expect(container.textContent).toContain("OpenCode");
    expect(container.textContent).toContain("Open a shell");
    expect(onLaunch).not.toHaveBeenCalled();

    clickButton(container, "Codex");
    expect(onLaunch).toHaveBeenLastCalledWith("codex");

    clickButton(container, "Open a shell");
    expect(onLaunch).toHaveBeenLastCalledWith("shell");
  });

  it("hides Agents that the trusted local inventory did not detect", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalLauncher
        discoveryPhase="ready"
        installedAgentIds={["codex"]}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )));

    expect(container.textContent).toContain("Codex");
    expect(container.textContent).not.toContain("Claude Code");
    expect(container.textContent).not.toContain("Cursor Agent");
    expect(container.textContent).not.toContain("OpenCode");
    expect(container.textContent).toContain("Open a shell");
  });

  it("keeps launcher commands closed, explicit, and unique", () => {
    expect(DESKTOP_TERMINAL_LAUNCHERS.map(({ id }) => id)).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode",
      "shell",
    ]);
    expect(new Set(DESKTOP_TERMINAL_LAUNCHERS.map(({ id }) => id)).size)
      .toBe(DESKTOP_TERMINAL_LAUNCHERS.length);
    expect(getDesktopTerminalLauncher("codex").command).toBe("codex");
    expect(getDesktopTerminalLauncher("claude").command).toBe("claude");
    expect(getDesktopTerminalLauncher("cursor").command).toBe("cursor-agent");
    expect(getDesktopTerminalLauncher("shell").command).toBeNull();
  });
});

function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  act(() => button.click());
}
