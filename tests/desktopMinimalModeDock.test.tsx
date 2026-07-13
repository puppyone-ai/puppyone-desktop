/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopMinimalModeDock } from "../src/features/app-shell/DesktopMinimalModeDock";
import { renderWithTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function renderDock(overrides: Partial<React.ComponentProps<typeof DesktopMinimalModeDock>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const onNavigate = vi.fn();
  const onExitMinimalMode = vi.fn();
  root = createRoot(container);
  act(() => renderWithTestLocalization(root,
    <DesktopMinimalModeDock
      activeView="data"
      cloudHubEnabled
      cloudToolsEnabled={false}
      contextMenuOpen={false}
      contextSlot={<button type="button" aria-label="Project switcher">Project</button>}
      pluginsEnabled
      titlebarActions={<button type="button" aria-label="Show Agent Chat">Chat</button>}
      workspaceKind="local"
      onExitMinimalMode={onExitMinimalMode}
      onNavigate={onNavigate}
      {...overrides}
    />,
  ));
  return { container, onExitMinimalMode, onNavigate };
}

describe("DesktopMinimalModeDock", () => {
  it("keeps shell commands in one horizontal icon dock", () => {
    const { container } = renderDock();
    expect(container.querySelector('.desktop-minimal-mode-controls')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Project switcher"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Files"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Changes"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Plugins"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Cloud"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Show Agent Chat"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Exit Minimal Mode"]')).not.toBeNull();
  });

  it("supports pinning, navigation, Escape, and exiting the mode", () => {
    const { container, onExitMinimalMode, onNavigate } = renderDock();
    const logo = container.querySelector('button[aria-label="Minimal Mode controls"]') as HTMLButtonElement;
    act(() => logo.click());
    expect(logo.getAttribute("aria-expanded")).toBe("true");

    act(() => (container.querySelector('button[aria-label="Changes"]') as HTMLButtonElement).click());
    expect(onNavigate).toHaveBeenCalledWith("git");
    expect(logo.getAttribute("aria-expanded")).toBe("false");

    act(() => logo.click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(logo.getAttribute("aria-expanded")).toBe("false");

    act(() => (container.querySelector('button[aria-label="Exit Minimal Mode"]') as HTMLButtonElement).click());
    expect(onExitMinimalMode).toHaveBeenCalledTimes(1);
  });

  it("uses History and Cloud-only tools for a Cloud workspace", () => {
    const { container } = renderDock({
      cloudHubEnabled: false,
      cloudToolsEnabled: true,
      pluginsEnabled: false,
      workspaceKind: "cloud",
    });
    expect(container.querySelector('button[aria-label="History"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Assets"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Automation"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Changes"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Plugins"]')).toBeNull();
  });
});
