/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_CHAT_CREATION_RECIPES } from "../src/features/app-shell/auxiliary-workbench/agentChatCreationRecipes";
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

describe("Unified Workbench launcher", () => {
  it("presents Chat first and creates the selected Agent directly", () => {
    const onCreateChat = vi.fn();
    const container = renderLauncher(
      <TerminalLauncher
        discoveryPhase="ready"
        availableAgentIds={["codex", "claude", "cursor", "opencode", "pi", "hermes"]}
        chatRecipes={AGENT_CHAT_CREATION_RECIPES}
        onCreateChat={onCreateChat}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const groups = container.querySelectorAll(".desktop-terminal-launcher-group");
    expect(groups).toHaveLength(2);
    expect(groups[0].classList).toContain("is-chat");
    expect(groups[1].classList).toContain("is-terminal");
    expect(groups[0].querySelector("h2")?.textContent).toBe("Chat");
    expect(groups[1].querySelector("h2")?.textContent).toBe("Terminal");

    const chatButtons = groups[0].querySelectorAll<HTMLButtonElement>(
      ".desktop-terminal-launcher-recipe",
    );
    expect(Array.from(chatButtons, (button) => button.textContent)).toEqual([
      "Codex",
      "Claude Code",
      "Cursor",
      "OpenCode",
      "PuppyOne",
    ]);
    expect(chatButtons[0].getAttribute("aria-label")).toBe("Chat: Codex");
    expect(chatButtons[4].getAttribute("aria-disabled")).toBe("true");
    expect(chatButtons[4].title).toBe("PuppyOne — Coming soon");

    act(() => chatButtons[0].click());
    expect(onCreateChat).toHaveBeenCalledOnce();
    expect(onCreateChat).toHaveBeenCalledWith(AGENT_CHAT_CREATION_RECIPES[0]);
    act(() => chatButtons[4].click());
    expect(onCreateChat).toHaveBeenCalledOnce();
  });

  it("keeps Shell first and every visible Terminal logo in one stable rail", () => {
    const onLaunch = vi.fn();
    const container = renderLauncher(
      <TerminalLauncher
        discoveryPhase="ready"
        availableAgentIds={["codex", "claude"]}
        onLaunch={onLaunch}
        onRefresh={vi.fn()}
      />,
    );
    const rail = container.querySelector(".desktop-terminal-launcher-group.is-terminal .desktop-terminal-launcher-rail");
    const buttons = rail?.querySelectorAll<HTMLButtonElement>("button") ?? [];
    expect(Array.from(buttons, (button) => button.textContent)).toEqual([
      "Shell",
      "Codex",
      "Claude Code",
      "Cursor Agent",
      "OpenCode",
      "Pi Agent",
      "Hermes Agent",
    ]);
    expect(container.querySelectorAll(".desktop-terminal-launcher-rail")).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Terminal: Shell");
    expect(buttons[3].getAttribute("aria-disabled")).toBe("true");
    expect(buttons[3].title).toBe("Cursor Agent — Not installed");
    for (const id of ["codex", "claude", "cursor", "opencode", "pi", "hermes"]) {
      expect(container.querySelector(`.desktop-terminal-launcher-icon.is-${id} img`)).not.toBeNull();
    }

    act(() => buttons[0].click());
    expect(onLaunch).toHaveBeenLastCalledWith("shell");
    act(() => buttons[1].click());
    expect(onLaunch).toHaveBeenLastCalledWith("codex");
    act(() => buttons[3].click());
    expect(onLaunch).toHaveBeenCalledTimes(2);
  });

  it("honors hidden Terminal Agents without collapsing detected availability", () => {
    const container = renderLauncher(
      <TerminalLauncher
        discoveryPhase="ready"
        availableAgentIds={["codex", "claude", "cursor"]}
        terminalAgentIds={["codex", "cursor"]}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Codex");
    expect(container.textContent).toContain("Cursor Agent");
    expect(container.textContent).not.toContain("Claude Code");
  });

  it("keeps discovery progress layout-stable while preserving refresh semantics", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const render = (phase: "loading" | "ready") => withTestLocalization(
      <TerminalLauncher
        discoveryPhase={phase}
        availableAgentIds={phase === "ready" ? ["codex"] : []}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    act(() => root?.render(render("loading")));
    const rail = container.querySelector(".desktop-terminal-launcher-rail");
    const codexButton = findButton(container, "Codex");
    expect(container.querySelector(".desktop-terminal-launcher-scan")?.classList)
      .toContain("is-scanning");
    expect(container.querySelector(".desktop-terminal-launcher-availability")?.textContent)
      .toContain("Looking for installed Agents");

    act(() => root?.render(render("ready")));
    expect(container.querySelector(".desktop-terminal-launcher-rail")).toBe(rail);
    expect(findButton(container, "Codex")).toBe(codexButton);
    expect(findButton(container, "Codex")?.getAttribute("aria-disabled")).toBe("false");
  });

  it("supports a standalone Chat contribution without exposing Terminal launchers", () => {
    const onCreateChat = vi.fn();
    const container = renderLauncher(
      <TerminalLauncher
        discoveryPhase="ready"
        availableAgentIds={[]}
        terminalEnabled={false}
        chatRecipes={AGENT_CHAT_CREATION_RECIPES}
        onCreateChat={onCreateChat}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const launcher = container.querySelector<HTMLElement>(".desktop-terminal-launcher");
    expect(container.querySelector(".desktop-terminal-launcher-group.is-chat")).not.toBeNull();
    expect(container.querySelector(".desktop-terminal-launcher-group.is-terminal")).toBeNull();
    expect(launcher?.getAttribute("aria-labelledby")).toBe("desktop-terminal-launcher-title");
    expect(container.querySelector("#desktop-terminal-launcher-title")?.textContent).toBe("Chat");
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
    expect(AGENT_CHAT_CREATION_RECIPES.map(({ id }) => id)).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode-native",
      "puppyone-agent",
    ]);
    expect(getDesktopTerminalLauncher("codex").id).toBe("codex");
    expect(getDesktopTerminalLauncher("hermes").id).toBe("hermes");
    expect(DESKTOP_TERMINAL_LAUNCHERS.every((launcher) => !("command" in launcher))).toBe(true);
  });

  it("keeps both rails available when a prior Terminal start reports an error", () => {
    const container = renderLauncher(
      <TerminalLauncher
        discoveryPhase="ready"
        availableAgentIds={["codex"]}
        chatRecipes={AGENT_CHAT_CREATION_RECIPES}
        onCreateChat={vi.fn()}
        launchError="The Agent could not start."
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("The Agent could not start.");
    expect(container.querySelectorAll(".desktop-terminal-launcher-rail")).toHaveLength(2);
  });
});

function renderLauncher(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(element)));
  return container;
}

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.includes(text));
}
