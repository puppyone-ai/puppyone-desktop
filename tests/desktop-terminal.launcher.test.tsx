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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("Unified Workbench launcher", () => {
  it("uses detected Terminal Agent commands above Shell before Chat opt-in", () => {
    const onLaunch = vi.fn();
    const container = renderLauncher(
      <TerminalLauncher
        agentMode="terminal"
        discoveryPhase="ready"
        availableAgentIds={["codex", "claude", "cursor", "opencode", "hermes"]}
        onLaunch={onLaunch}
        onRefresh={vi.fn()}
      />,
    );

    const groups = container.querySelectorAll(".desktop-terminal-launcher-group");
    expect(groups).toHaveLength(2);
    expect(groups[0].classList).toContain("is-agents");
    expect(groups[1].classList).toContain("is-shell");
    expect(groups[0].getAttribute("data-agent-mode")).toBe("terminal");
    expect(groups[0].querySelector("h2")?.textContent).toBe("start with an agent");
    expect(groups[1].querySelector("h2")?.textContent).toBe("or open a shell");

    const agentButtons = groups[0].querySelectorAll<HTMLButtonElement>(
      ".desktop-terminal-launcher-tool",
    );
    expect(Array.from(agentButtons, (button) => button.textContent)).toEqual([
      "Codex",
      "Claude Code",
      "Cursor Agent",
      "OpenCode",
      "Hermes Agent",
    ]);
    expect(agentButtons[0].getAttribute("aria-label"))
      .toBe("start with an agent: Codex. Run the Codex CLI");
    expect(Array.from(agentButtons, (button) => button.disabled)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);

    const shellButtons = groups[1].querySelectorAll<HTMLButtonElement>("button");
    expect(shellButtons).toHaveLength(1);
    expect(shellButtons[0].textContent).toBe("Open a shell");
    expect(container.querySelector(".desktop-terminal-launcher-rail")).toBeNull();
    expect(container.querySelector(".desktop-terminal-launcher-group.is-terminal")).toBeNull();

    act(() => agentButtons[0].click());
    expect(onLaunch).toHaveBeenCalledWith("codex");
    act(() => shellButtons[0].click());
    expect(onLaunch).toHaveBeenCalledWith("shell");
  });

  it("switches the same frame to Chat recipes only in Chat mode", () => {
    const onCreateChat = vi.fn();
    const onLaunch = vi.fn();
    const container = renderLauncher(
      <TerminalLauncher
        agentMode="chat"
        discoveryPhase="ready"
        availableAgentIds={["codex", "claude", "cursor", "opencode", "pi", "hermes"]}
        chatRecipes={AGENT_CHAT_CREATION_RECIPES}
        onCreateChat={onCreateChat}
        onLaunch={onLaunch}
        onRefresh={vi.fn()}
      />,
    );

    const agentGroup = container.querySelector<HTMLElement>(
      ".desktop-terminal-launcher-group.is-agents",
    );
    expect(agentGroup?.getAttribute("data-agent-mode")).toBe("chat");
    const agentButtons = agentGroup?.querySelectorAll<HTMLButtonElement>(
      ".desktop-terminal-launcher-tool",
    ) ?? [];
    expect(Array.from(agentButtons, (button) => button.textContent)).toEqual([
      "Codex",
      "Claude Code",
      "Cursor",
      "OpenCode",
      "PuppyOne",
    ]);
    expect(agentButtons[4]?.disabled).toBe(true);
    expect(agentButtons[4]?.title).toBe("PuppyOne — Coming soon");
    act(() => agentButtons[0]?.click());
    expect(onCreateChat).toHaveBeenCalledWith(AGENT_CHAT_CREATION_RECIPES[0]);
    expect(onLaunch).not.toHaveBeenCalled();

    expect(container.querySelectorAll(".desktop-terminal-launcher-shell")).toHaveLength(1);
    expect(container.textContent).not.toContain("Pi Agent");
    expect(container.textContent).not.toContain("Hermes Agent");
  });

  it("keeps the full Terminal Agent catalog command-free and renders only detected ids", () => {
    const container = renderLauncher(
      <TerminalLauncher
        agentMode="terminal"
        discoveryPhase="ready"
        availableAgentIds={["hermes", "codex"]}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(Array.from(
      container.querySelectorAll<HTMLButtonElement>(".desktop-terminal-launcher-tool"),
      (button) => button.textContent,
    )).toEqual(["Codex", "Hermes Agent"]);
    expect(DESKTOP_TERMINAL_LAUNCHERS.map(({ id }) => id)).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode",
      "pi",
      "hermes",
      "shell",
    ]);
    expect(DESKTOP_TERMINAL_LAUNCHERS.every((launcher) => !("command" in launcher))).toBe(true);
  });

  it("keeps discovery progress assistive and the vertical Agent list layout-stable", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const render = (phase: "loading" | "ready") => withTestLocalization(
      <TerminalLauncher
        agentMode="chat"
        discoveryPhase={phase}
        availableAgentIds={phase === "ready" ? ["codex"] : []}
        chatRecipes={AGENT_CHAT_CREATION_RECIPES}
        onCreateChat={vi.fn()}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    act(() => root?.render(render("loading")));
    const tools = container.querySelector(".desktop-terminal-launcher-tools");
    const codexButton = findButton(container, "Codex");
    expect(container.querySelector(".desktop-terminal-launcher-scan")?.classList)
      .toContain("is-scanning");
    expect(container.querySelector(".desktop-terminal-launcher-availability")?.textContent)
      .toContain("Looking for installed Agents");

    act(() => root?.render(render("ready")));
    expect(container.querySelector(".desktop-terminal-launcher-tools")).toBe(tools);
    expect(findButton(container, "Codex")).toBe(codexButton);
    expect(findButton(container, "Codex")?.disabled).toBe(false);
  });

  it("supports a standalone Chat launcher without exposing the Shell frame", () => {
    const container = renderLauncher(
      <TerminalLauncher
        agentMode="chat"
        discoveryPhase="ready"
        availableAgentIds={[]}
        terminalEnabled={false}
        chatRecipes={AGENT_CHAT_CREATION_RECIPES}
        onCreateChat={vi.fn()}
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(container.querySelector(".desktop-terminal-launcher-group.is-agents")).not.toBeNull();
    expect(container.querySelector(".desktop-terminal-launcher-group.is-shell")).toBeNull();
    expect(container.querySelector("#desktop-terminal-launcher-title")?.textContent)
      .toBe("start with an agent");
  });

  it("keeps Chat recipe identities explicit and PuppyOne last until Hornet ships", () => {
    expect(AGENT_CHAT_CREATION_RECIPES.map(({ id }) => id)).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode-native",
      "puppyone-agent",
    ]);
    expect(getDesktopTerminalLauncher("codex").id).toBe("codex");
    expect(getDesktopTerminalLauncher("hermes").id).toBe("hermes");
  });

  it("keeps both frames available when a prior Shell start reports an error", () => {
    const container = renderLauncher(
      <TerminalLauncher
        agentMode="chat"
        discoveryPhase="ready"
        availableAgentIds={[]}
        chatRecipes={AGENT_CHAT_CREATION_RECIPES}
        onCreateChat={vi.fn()}
        launchError="The Agent could not start."
        onLaunch={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("The Agent could not start.");
    expect(container.querySelectorAll(".desktop-terminal-launcher-group")).toHaveLength(2);
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
