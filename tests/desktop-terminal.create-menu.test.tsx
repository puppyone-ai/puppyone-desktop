/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalWorkbenchCreateMenu } from "../src/features/desktop-terminal/workbench/TerminalWorkbenchCreateMenu";
import type { TerminalWorkbenchCreateOption } from "../src/features/desktop-terminal/workbench/TerminalWorkbenchHeader.types";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("Unified Workbench create menu", () => {
  it("groups direct Chat recipes before direct Terminal recipes", async () => {
    const createCodexChat = vi.fn();
    const createPuppyOneChat = vi.fn();
    const createShell = vi.fn();
    const options: readonly TerminalWorkbenchCreateOption[] = [
      {
        id: "agent-chat:codex",
        group: "chat",
        groupLabel: "Chat",
        iconKey: "codex",
        label: "Codex",
        onCreate: createCodexChat,
      },
      {
        id: "agent-chat:puppyone-agent",
        group: "chat",
        groupLabel: "Chat",
        iconKey: "puppyone-agent",
        label: "PuppyOne",
        detail: "Coming soon",
        disabled: true,
        onCreate: createPuppyOneChat,
      },
      {
        id: "terminal:shell",
        group: "terminal",
        groupLabel: "Terminal",
        launcherId: "shell",
        label: "Shell",
        onCreate: createShell,
      },
    ];
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(withTestLocalization(<TerminalWorkbenchCreateMenu options={options} />));
    });

    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="New terminal"]');
    await act(async () => trigger?.click());
    const menu = document.body.querySelector('[role="menu"]');
    expect((menu as HTMLElement | null)?.style.position).toBe("fixed");
    const sections = menu?.querySelectorAll(".desktop-menu-section") ?? [];
    expect(sections).toHaveLength(2);
    expect(sections[0].querySelector(".desktop-menu-section-label")?.textContent).toBe("Chat");
    expect(sections[1].querySelector(".desktop-menu-section-label")?.textContent).toBe("Terminal");
    expect(sections[0].querySelector(".desktop-terminal-launcher-icon.is-codex")).not.toBeNull();
    expect(sections[0].querySelector(".desktop-terminal-launcher-icon.is-puppyone")).not.toBeNull();
    expect(sections[1].querySelector(".desktop-terminal-launcher-icon.is-shell")).not.toBeNull();
    expect(findMenuButton("PuppyOne")?.disabled).toBe(true);
    expect(findMenuButton("PuppyOne")?.textContent).toContain("Coming soon");

    await act(async () => findMenuButton("Codex")?.click());
    expect(createCodexChat).toHaveBeenCalledOnce();
    expect(createPuppyOneChat).not.toHaveBeenCalled();
    expect(createShell).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});

function findMenuButton(label: string) {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    .find((button) => button.textContent?.includes(label));
}
