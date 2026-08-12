/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DesktopCreateEntryMenu,
  DesktopNodeActionMenu,
  type DesktopCreateEntryDraft,
  type DesktopNodeActionMenuDraft,
} from "../src/features/data-workspace/nodeActions";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("create entry menu", () => {
  it("marks the Sidebar launcher menu as a full-width floating surface that can open upward", () => {
    const draft = createDraft();
    draft.anchor = {
      ...draft.anchor,
      top: 700,
      bottom: 730,
      right: 284,
      width: 264,
      height: 30,
      placement: "auto-end",
    };
    const container = render(
      <DesktopCreateEntryMenu
        draft={draft}
        fileKinds={["markdown", "csv"]}
        onCancel={vi.fn()}
        onSelectKind={vi.fn()}
      />,
    );

    const menu = container.querySelector<HTMLElement>(".desktop-create-entry-menu");
    expect(menu?.dataset.sidebarLauncher).toBe("true");
    expect(menu?.id).toBe("desktop-sidebar-create-menu");
    expect(menu?.style.getPropertyValue("--node-action-menu-width")).toBe("264px");
    expect(Number.parseFloat(menu?.style.getPropertyValue("--node-action-menu-top") ?? ""))
      .toBeLessThan(draft.anchor.top);
  });

  it("offers only Folder, Markdown, and CSV in the intended grouping", () => {
    const onSelectKind = vi.fn();
    const container = render(
      <DesktopCreateEntryMenu
        draft={createDraft()}
        fileKinds={["markdown", "csv"]}
        onCancel={vi.fn()}
        onSelectKind={onSelectKind}
      />,
    );
    const menu = container.querySelector<HTMLElement>(".desktop-create-entry-menu");
    expect(menu).not.toBeNull();
    expect(Array.from(menu?.children ?? [], (child) => (
      child.classList.contains("desktop-menu-separator") ? "divider" : child.textContent?.trim()
    ))).toEqual([
      "Folder",
      "divider",
      "Markdown file",
      "CSV file",
    ]);

    expect(container.textContent).not.toContain("Paste");
    expect(container.textContent).not.toContain("Text file");
    expect(container.textContent).not.toContain("JSON file");
    expect(container.textContent).not.toContain("Custom files");

    act(() => Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "CSV file")?.click());
    expect(onSelectKind).toHaveBeenCalledWith("csv");
  });

  it("renders the configured file type order without adding hidden defaults", () => {
    const container = render(
      <DesktopCreateEntryMenu
        draft={createDraft()}
        fileKinds={["json", "markdown"]}
        onCancel={vi.fn()}
        onSelectKind={vi.fn()}
      />,
    );

    expect(Array.from(
      container.querySelector(".desktop-create-entry-menu")?.children ?? [],
      (child) => child.classList.contains("desktop-menu-separator")
        ? "divider"
        : child.querySelector(".desktop-menu-item-label")?.textContent?.trim(),
    )).toEqual([
      "Folder",
      "divider",
      "JSON file",
      "Markdown file",
    ]);
  });

  it("does not render a divider when Folder is the only configured item", () => {
    const container = render(
      <DesktopCreateEntryMenu
        draft={createDraft()}
        fileKinds={[]}
        onCancel={vi.fn()}
        onSelectKind={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".desktop-menu-separator")).toHaveLength(0);
    expect(container.querySelector(".desktop-create-entry-menu")?.textContent?.trim()).toBe("Folder");
  });

  it("keeps paste available in the folder action menu", () => {
    const container = render(
      <DesktopNodeActionMenu
        draft={nodeActionDraft()}
        canPaste
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onCopy={vi.fn()}
        onCut={vi.fn()}
        onPaste={vi.fn()}
        onDuplicate={vi.fn()}
        onCreateInside={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onOpenInDefaultApp={vi.fn()}
        onRevealInFinder={vi.fn()}
      />,
    );

    const labels = Array.from(
      container.querySelectorAll("button"),
      (button) => button.textContent?.trim() ?? "",
    );
    expect(labels.some((label) => label.startsWith("Paste into folder"))).toBe(true);
  });
});

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(element)));
  return container;
}

function createDraft(): DesktopCreateEntryDraft {
  return {
    parentPath: null,
    anchor: {
      left: 20,
      top: 20,
      right: 44,
      bottom: 44,
      width: 24,
      height: 24,
    },
    error: null,
    creatingKind: null,
    selectedKind: null,
    name: "",
  };
}

function nodeActionDraft(): DesktopNodeActionMenuDraft {
  const node = {
    id: "folder-1",
    name: "Documents",
    path: "Documents",
    type: "folder",
  } as const;
  return {
    node,
    nodes: [node],
    anchor: {
      left: 20,
      top: 20,
      right: 44,
      bottom: 44,
      width: 24,
      height: 24,
    },
    mode: "actions",
    renameNameValue: "Documents",
    renameExtensionValue: "",
    renameFocus: "name",
    error: null,
    operation: null,
  };
}
