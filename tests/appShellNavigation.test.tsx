/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DesktopSidebarFooterNavigation,
  DesktopSidebarRailNavigation,
  DesktopSidebarTopNavigation,
} from "../src/features/app-shell/navigation";

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

  it("places Cloud hub after Settings in the left-aligned sequence and omits the linked dot", () => {
    const onNavigate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <DesktopSidebarTopNavigation
        activeView="data"
        cloudHubEnabled
        cloudToolsEnabled={false}
        gitEnabled
        pluginsEnabled={false}
        orientation="horizontal"
        gitIncomingCount={0}
        gitOperationLoading={null}
        gitStatus={null}
        workspaceChangeCount={0}
        onNavigate={onNavigate}
        onOpenSettings={vi.fn()}
      />,
    ));

    expect(
      Array.from(container.querySelectorAll("button"), (button) => button.getAttribute("aria-label")),
    ).toEqual(["Files", "Changes", "Settings", "Cloud"]);
    expect(container.querySelectorAll(".desktop-sidebar-top-navigation-group")).toHaveLength(1);
    expect(container.querySelector(".desktop-sidebar-top-navigation-end")).toBeNull();
    expect(container.querySelector('[aria-label="Cloud"] .desktop-sidebar-nav-cloud-dot')).toBeNull();
    expect(container.querySelector('[aria-label="Assets"]')).toBeNull();
    expect(container.querySelector('[aria-label="Automation"]')).toBeNull();
    expect(container.querySelector('[aria-label="History"]')).toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Cloud"]')?.click());
    expect(onNavigate).toHaveBeenCalledWith("cloud");
  });
});

describe("DesktopSidebarFooterNavigation", () => {
  it("keeps Settings and Cloud in the same left-to-right action group", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <DesktopSidebarFooterNavigation
        activeView="data"
        cloudHubEnabled
        cloudToolsEnabled={false}
        gitEnabled
        pluginsEnabled={false}
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
    ).toEqual(["Files", "Changes", "Settings", "Cloud"]);
    expect(container.querySelectorAll(".desktop-sidebar-footer-actions")).toHaveLength(1);
  });
});

describe("DesktopSidebarRailNavigation local Cloud hub", () => {
  it("keeps Changes on Local projects and places Cloud after Settings", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <DesktopSidebarRailNavigation
        activeView="git"
        cloudHistoryEnabled={false}
        cloudHubEnabled
        cloudToolsEnabled={false}
        gitEnabled
        pluginsEnabled={false}
        gitIncomingCount={0}
        gitOperationLoading={null}
        gitStatus={null}
        workspaceChangeCount={2}
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    ));

    expect(
      Array.from(container.querySelectorAll("button"), (button) => button.getAttribute("aria-label")),
    ).toEqual(["Files, workspace changes detected", "Changes, 2 workspace changes", "Settings", "Cloud"]);
    expect(container.querySelector('button[aria-label="History"]')).toBeNull();
    expect(container.querySelector(".desktop-sidebar-nav-cloud-dot")).toBeNull();
  });
});
