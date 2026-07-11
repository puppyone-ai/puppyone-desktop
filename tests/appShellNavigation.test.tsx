/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopSidebarTopNavigation } from "../src/features/app-shell/navigation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("DesktopSidebarTopNavigation", () => {
  it("orders Cloud project actions as Files, Assets, Automation, then Settings", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <DesktopSidebarTopNavigation
        activeView="data"
        cloudToolsEnabled
        gitEnabled={false}
        pluginsEnabled={false}
        orientation="horizontal"
        gitIncomingCount={0}
        gitOperationLoading={null}
        gitStatus={null}
        workspaceChangeCount={0}
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    ));

    expect(
      Array.from(container.querySelectorAll("button"), (button) => button.getAttribute("aria-label")),
    ).toEqual(["Files", "Assets", "Automation", "Settings"]);
    expect(container.querySelector('[aria-label="Assets"] [data-icon="assets-distribution"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Automation"] .lucide-workflow')).not.toBeNull();
    expect(container.querySelectorAll(".desktop-sidebar-top-navigation-group")).toHaveLength(1);
  });
});
