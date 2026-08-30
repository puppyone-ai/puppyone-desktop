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
import {
  partitionTerminalAgentLaunchers,
  TERMINAL_AGENT_PRIMARY_LIMIT,
} from "../src/features/desktop-terminal/model/terminalLauncherPresentation";
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
        availableAgentIds={["codex", "claude", "cursor", "opencode", "pi", "hermes"]}
        onLaunch={onLaunch}
        onRefresh={vi.fn()}
      />,
    )));

    expect(container.querySelector(".desktop-terminal-launcher")).not.toBeNull();
    expect(container.querySelector(".desktop-terminal-launcher-scan")?.getAttribute("aria-label"))
      .toBe("Scan again");
    expect(container.querySelector(".desktop-terminal-launcher-scan")?.textContent?.trim()).toBe("");
    expect(container.textContent).toContain("start with an agent");
    expect(container.textContent).toContain("or open a shell");
    expect(container.querySelector(".desktop-terminal-launcher-group.is-agents")).not.toBeNull();
    expect(container.querySelector(".desktop-terminal-launcher-group.is-shell")).not.toBeNull();
    expect(container.textContent).toContain("Codex");
    expect(container.textContent).toContain("Claude Code");
    expect(container.textContent).toContain("Cursor Agent");
    expect(container.textContent).toContain("OpenCode");
    expect(container.textContent).toContain("Pi Agent");
    expect(container.textContent).toContain("Hermes Agent");
    expect(container.textContent).toContain("Open a shell");
    for (const id of ["codex", "claude", "cursor", "opencode", "pi", "hermes"]) {
      expect(container.querySelector(`.desktop-terminal-launcher-icon.is-${id} img`)).not.toBeNull();
    }
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
        availableAgentIds={["codex"]}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )));

    expect(container.textContent).toContain("Codex");
    expect(container.textContent).not.toContain("Claude Code");
    expect(container.textContent).not.toContain("Cursor Agent");
    expect(container.textContent).not.toContain("OpenCode");
    expect(container.textContent).not.toContain("Pi Agent");
    expect(container.textContent).not.toContain("Hermes Agent");
    expect(container.textContent).toContain("Open a shell");
  });

  it("keeps refresh discovery status out of layout when Agent cards already exist", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const render = (discoveryPhase: "loading" | "ready") => withTestLocalization(
      <TerminalLauncher
        discoveryPhase={discoveryPhase}
        availableAgentIds={["codex", "claude"]}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    act(() => root?.render(render("ready")));
    const codexButton = findButton(container, "Codex");
    const tools = container.querySelector(".desktop-terminal-launcher-tools");

    act(() => root?.render(render("loading")));
    expect(findButton(container, "Codex")).toBe(codexButton);
    expect(container.querySelector(".desktop-terminal-launcher-tools")).toBe(tools);
    expect(container.querySelector(".desktop-terminal-launcher-availability")?.classList)
      .toContain("is-assistive");
    expect(container.querySelector(".desktop-terminal-launcher-scan")?.classList)
      .toContain("is-scanning");

    act(() => root?.render(render("ready")));
    expect(findButton(container, "Codex")).toBe(codexButton);
    expect(container.querySelector(".desktop-terminal-launcher-availability")).toBeNull();
  });

  it("uses the detecting row as the empty-state slot before the first Agent arrives", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalLauncher
        discoveryPhase="loading"
        availableAgentIds={[]}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )));

    expect(container.querySelector(".desktop-terminal-launcher-tools")).toBeNull();
    expect(container.querySelector(".desktop-terminal-launcher-availability")?.classList)
      .not.toContain("is-assistive");
  });

  it("keeps launcher identities closed, explicit, and free of renderer commands", () => {
    expect(DESKTOP_TERMINAL_LAUNCHERS.map(({ id }) => id)).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode",
      "pi",
      "hermes",
      "shell",
    ]);
    expect(new Set(DESKTOP_TERMINAL_LAUNCHERS.map(({ id }) => id)).size)
      .toBe(DESKTOP_TERMINAL_LAUNCHERS.length);
    expect(getDesktopTerminalLauncher("codex").id).toBe("codex");
    expect(getDesktopTerminalLauncher("cursor").id).toBe("cursor");
    expect(getDesktopTerminalLauncher("pi").id).toBe("pi");
    expect(getDesktopTerminalLauncher("hermes").id).toBe("hermes");
    expect(DESKTOP_TERMINAL_LAUNCHERS.every((launcher) => !("command" in launcher))).toBe(true);
  });

  it("keeps the launcher visible and reports a failed Agent start", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalLauncher
        discoveryPhase="ready"
        availableAgentIds={["codex"]}
        launchError="The Agent could not start."
        launching={false}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )));

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("The Agent could not start.");
    expect(container.textContent).toContain("start with an agent");
  });

  it("supports a standalone Chat contribution without exposing terminal launchers", () => {
    const onCreateChat = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TerminalLauncher
        discoveryPhase="ready"
        availableAgentIds={[]}
        terminalEnabled={false}
        onCreateChat={onCreateChat}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )));

    const launcher = container.querySelector<HTMLElement>(".desktop-terminal-launcher");
    const labelledBy = launcher?.getAttribute("aria-labelledby");
    expect(container.querySelector(".desktop-terminal-launcher-group.is-chat")).not.toBeNull();
    expect(container.querySelector(".desktop-terminal-launcher-group.is-agents")).toBeNull();
    expect(container.querySelector(".desktop-terminal-launcher-group.is-shell")).toBeNull();
    expect(labelledBy).toBe("desktop-terminal-launcher-title");
    expect(container.querySelector(`#${labelledBy}`)).not.toBeNull();

    clickButton(container, "New chat");
    expect(onCreateChat).toHaveBeenCalledOnce();
  });

  it("moves only future catalog growth into the quiet overflow section", () => {
    const values = Array.from({ length: 8 }, (_, index) => `agent-${index}`);
    expect(partitionTerminalAgentLaunchers(values)).toEqual({
      primary: values.slice(0, TERMINAL_AGENT_PRIMARY_LIMIT),
      overflow: values.slice(TERMINAL_AGENT_PRIMARY_LIMIT),
    });
  });
});

function clickButton(container: HTMLElement, text: string) {
  const button = findButton(container, text);
  if (!button) throw new Error(`Button not found: ${text}`);
  act(() => button.click());
}

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.includes(text));
}
