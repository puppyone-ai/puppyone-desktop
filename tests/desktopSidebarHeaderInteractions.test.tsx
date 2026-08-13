/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopCloudShell } from "../src/components/DesktopCloudShell";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("desktop explorer Header expansion", () => {
  it("shows the expansion action only while the resolved explorer is collapsed", () => {
    const collapsed = renderShell({ leftSidebarCollapsed: true });
    expect(collapsed.querySelector(".desktop-titlebar-sidebar-expand")).not.toBeNull();
    expect(collapsed.querySelector(".desktop-shell")?.getAttribute("data-titlebar-sidebar-state"))
      .toBe("collapsed");
    expect(collapsed.querySelector(".desktop-titlebar-sidebar-context")?.textContent)
      .not.toContain("Workspace");
    expect(collapsed.querySelector(".desktop-titlebar-editor-context")?.textContent)
      .toContain("Editors");

    resetRender();

    const expanded = renderShell({ leftSidebarCollapsed: false });
    expect(expanded.querySelector(".desktop-titlebar-sidebar-expand")).toBeNull();
    expect(expanded.querySelector(".desktop-shell")?.getAttribute("data-titlebar-sidebar-state"))
      .toBe("expanded");
    expect(expanded.querySelector<HTMLElement>(".desktop-shell")?.style.getPropertyValue(
      "--desktop-titlebar-sidebar-width",
    )).toBe("320px");
    expect(expanded.querySelector(".desktop-titlebar-sidebar-context")?.textContent)
      .toContain("Workspace");
  });

  it("does not expose an expansion action merely because the window is compact", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(640);
    const onLeftSidebarExpand = vi.fn();
    const container = renderShell({
      leftSidebarCollapsed: false,
      onLeftSidebarExpand,
      rightSidebar: <div>Auxiliary</div>,
      rightSidebarOpen: true,
    });

    expect(container.querySelector(".desktop-titlebar-sidebar-expand")).toBeNull();
    expect(onLeftSidebarExpand).not.toHaveBeenCalled();
  });

  it("expands an explicitly collapsed explorer from the single Header action", () => {
    const onLeftSidebarExpand = vi.fn();
    const container = renderShell({
      leftSidebarCollapsed: true,
      onLeftSidebarExpand,
    });
    const button = requireExpandButton(container);

    act(() => button.click());

    expect(onLeftSidebarExpand).toHaveBeenCalledOnce();
    expect(onLeftSidebarExpand).toHaveBeenCalledWith();
    expect(button.getAttribute("aria-label")).toBe("Expand sidebar");
  });
});

function renderShell({
  leftSidebarCollapsed,
  onLeftSidebarExpand = vi.fn(),
  rightSidebar,
  rightSidebarOpen = false,
}: {
  leftSidebarCollapsed: boolean;
  onLeftSidebarExpand?: () => void;
  rightSidebar?: React.ReactNode;
  rightSidebarOpen?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(withTestLocalization(
      <DesktopCloudShell
        leftSidebarCollapsed={leftSidebarCollapsed}
        onLeftSidebarExpand={onLeftSidebarExpand}
        rightSidebar={rightSidebar}
        rightSidebarOpen={rightSidebarOpen}
        titlebarSidebarSlot={<div>Workspace</div>}
        titlebarEditorSlot={<div>Editors</div>}
      >
        <div>Editor</div>
      </DesktopCloudShell>,
    ));
  });
  return container;
}

function requireExpandButton(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>(".desktop-titlebar-sidebar-expand");
  if (!button) throw new Error("Missing collapsed explorer expansion action");
  return button;
}

function resetRender() {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
}
