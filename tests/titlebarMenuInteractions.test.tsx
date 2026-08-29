/**
 * @vitest-environment happy-dom
 */
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopTitlebarContext } from "../src/features/app-shell/DesktopTitlebarContext";
import { DesktopWorkspaceSwitcher } from "../src/features/app-shell/DesktopWorkspaceSwitcher";
import type { GitBranchSummary } from "../src/types/electron";
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

describe("titlebar Portal menu interactions", () => {
  it("keeps workspace menu actions clickable outside the native Header tree", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const anchorRef = createRef<HTMLDivElement>();
    const onGoHome = vi.fn();
    const onClose = vi.fn();
    const onAddFolder = vi.fn();
    const onOpenFolder = vi.fn();
    const onOpenItem = vi.fn();
    const workspace = createWorkspace("one", "Workspace one");
    const currentItem = {
      id: workspace.id,
      label: workspace.name,
      detail: "/tmp",
      title: workspace.name,
      workspace,
    };
    const item = {
      id: "two",
      label: "Workspace two",
      detail: "/tmp/two",
      title: "Workspace two",
      workspace: createWorkspace("two", "Workspace two"),
    };

    await act(async () => {
      root?.render(withTestLocalization(
        <DesktopWorkspaceSwitcher
          open
          refObject={anchorRef}
          titlebarLabel={workspace.name}
          workspace={workspace}
          items={[currentItem, item]}
          onAddFolder={onAddFolder}
          onClose={onClose}
          onOpenFolder={onOpenFolder}
          onOpenItem={onOpenItem}
          onGoHome={onGoHome}
          onToggle={vi.fn()}
        />,
      ));
      await Promise.resolve();
    });

    const menu = requireMenu();
    expect(container.contains(menu)).toBe(false);
    expect(menu.dataset.windowNoDrag).toBe("true");
    expect(menu.style.width).toBe("300px");
    expect(menu.textContent).toContain("Current workspace");
    expect(menu.textContent).toContain("Add Folder to Workspace…");
    expect(menu.textContent).toContain("Open Folder…");
    expect(menu.textContent).toContain("Recent projects");
    act(() => menu.querySelector<HTMLButtonElement>(".desktop-project-home")?.click());
    act(() => menu.querySelector<HTMLButtonElement>(".desktop-project-add-folder")?.click());
    act(() => menu.querySelector<HTMLButtonElement>(".desktop-project-open-folder")?.click());
    act(() => menu.querySelector<HTMLButtonElement>(".desktop-project-recent-section .desktop-project-option")?.click());

    expect(onGoHome).toHaveBeenCalledOnce();
    expect(onAddFolder).toHaveBeenCalledOnce();
    expect(onOpenFolder).toHaveBeenCalledOnce();
    expect(onOpenItem).toHaveBeenCalledWith(item);
  });

  it("dismisses a titlebar menu when the user points outside it", async () => {
    const container = document.createElement("div");
    const titlebarDragRegion = document.createElement("div");
    titlebarDragRegion.dataset.windowDragRegion = "true";
    document.body.append(container, titlebarDragRegion);
    root = createRoot(container);
    const onClose = vi.fn();

    await act(async () => {
      root?.render(withTestLocalization(
        <DesktopWorkspaceSwitcher
          open
          refObject={createRef<HTMLDivElement>()}
          titlebarLabel="Workspace one"
          workspace={createWorkspace("one", "Workspace one")}
          items={[]}
          onAddFolder={vi.fn()}
          onClose={onClose}
          onOpenFolder={vi.fn()}
          onOpenItem={vi.fn()}
          onGoHome={vi.fn()}
          onToggle={vi.fn()}
        />,
      ));
      await Promise.resolve();
    });

    act(() => {
      requireMenu().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      titlebarDragRegion.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("executes branch checkout from the Portal menu and closes after success", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onCheckoutBranch = vi.fn(async () => true);
    const onCloseBranchSwitcher = vi.fn();
    const branch = createBranch("feature/menu");

    await act(async () => {
      root?.render(withTestLocalization(
        <DesktopTitlebarContext
          activeGitStatus={createGitStatus()}
          branchSwitcherOpen
          branchSwitcherRef={createRef<HTMLDivElement>()}
          gitStatusLoading={false}
          gitOperationLoading={null}
          localBranches={[branch]}
          remoteBranches={[]}
          workspace={createWorkspace("one", "Workspace one")}
          workspaceSwitcherItems={[]}
          workspaceSwitcherOpen={false}
          workspaceSwitcherRef={createRef<HTMLDivElement>()}
          onCheckoutBranch={onCheckoutBranch}
          onCloseBranchSwitcher={onCloseBranchSwitcher}
          onCloseWorkspaceSwitcher={vi.fn()}
          onGoHome={vi.fn()}
          onOpenFolder={vi.fn()}
          onOpenWorkspaceSwitcherItem={vi.fn()}
          onToggleBranchSwitcher={vi.fn()}
          onToggleWorkspaceSwitcher={vi.fn()}
        />,
      ));
      await Promise.resolve();
    });

    const button = requireMenu().querySelector<HTMLButtonElement>(".desktop-branch-menu-row");
    if (!button) throw new Error("Missing branch menu action");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(onCheckoutBranch).toHaveBeenCalledWith("feature/menu", false);
    expect(onCloseBranchSwitcher).toHaveBeenCalledOnce();
  });
});

function requireMenu(): HTMLElement {
  const menu = document.querySelector<HTMLElement>('[data-titlebar-context-menu="true"]');
  if (!menu) throw new Error("Missing titlebar Portal menu");
  return menu;
}

function createWorkspace(id: string, name: string) {
  return {
    id,
    name,
    path: `/tmp/${id}`,
    status: "recording" as const,
  };
}

function createBranch(name: string): GitBranchSummary {
  return {
    name,
    current: false,
    remote: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    lastCommitId: null,
    lastCommitMessage: null,
    lastCommitDate: null,
  };
}

function createGitStatus() {
  return {
    isRepo: true,
    branch: "main",
    detached: false,
    head: null,
    stagedEntries: [],
    unstagedEntries: [],
    untrackedEntries: [],
    conflictedEntries: [],
    ahead: 0,
    behind: 0,
  };
}
