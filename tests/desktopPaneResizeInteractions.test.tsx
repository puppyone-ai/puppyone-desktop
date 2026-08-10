/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataPort } from "../packages/shared-ui/src/core/types";
import { DataWorkspace } from "../packages/shared-ui/src/data/DataWorkspace";
import { AuxiliaryPanelHost } from "../src/features/app-shell/auxiliary/AuxiliaryPanelHost";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  document.body.className = "";
  vi.restoreAllMocks();
});

describe("desktop side-pane resize interactions", () => {
  it("collapses the explorer after the pointer crosses its snap threshold", async () => {
    const onCollapsedChange = vi.fn();
    const onWidthChange = vi.fn();
    const container = await renderWorkspace({ onCollapsedChange, onWidthChange });
    const handle = requireHandle(container, ".data-explorer-resizer");

    act(() => {
      handle.dispatchEvent(pointerEvent("pointerdown", 320, 1));
      window.dispatchEvent(pointerEvent("pointermove", 120, 1));
      window.dispatchEvent(pointerEvent("pointerup", 120, 1));
    });

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(onWidthChange).not.toHaveBeenCalledWith(expect.any(Number));
  });

  it("keeps explorer resize values inside the expanded range before snapping", async () => {
    const onCollapsedChange = vi.fn();
    const onWidthChange = vi.fn();
    const container = await renderWorkspace({ onCollapsedChange, onWidthChange });
    const handle = requireHandle(container, ".data-explorer-resizer");

    act(() => {
      handle.dispatchEvent(pointerEvent("pointerdown", 320, 2));
      window.dispatchEvent(pointerEvent("pointermove", 500, 2));
      window.dispatchEvent(pointerEvent("pointerup", 500, 2));
    });

    expect(onCollapsedChange).not.toHaveBeenCalledWith(true);
    expect(onWidthChange).toHaveBeenLastCalledWith(500);
  });

  it("collapses the right sidebar by pointer threshold and keyboard minimum", () => {
    const onOpenChange = vi.fn();
    const onWidthChange = vi.fn();
    const container = render(withTestLocalization(
      <AuxiliaryPanelHost
        collapseThreshold={320}
        maxWidth={900}
        minWidth={420}
        open
        resizable
        width={420}
        onOpenChange={onOpenChange}
        onWidthChange={onWidthChange}
      >
        <div>Terminal</div>
      </AuxiliaryPanelHost>,
    ));
    const handle = requireHandle(container, ".desktop-right-sidebar-resizer");

    act(() => {
      handle.dispatchEvent(pointerEvent("pointerdown", 0, 3));
      window.dispatchEvent(pointerEvent("pointermove", 150, 3));
      window.dispatchEvent(pointerEvent("pointerup", 150, 3));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    act(() => handle.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Home",
    })));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

async function renderWorkspace({
  onCollapsedChange,
  onWidthChange,
}: {
  onCollapsedChange: (collapsed: boolean) => void;
  onWidthChange: (width: number) => void;
}) {
  const dataPort: DataPort = {
    listChildren: vi.fn(async () => []),
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(withTestLocalization(
      <DataWorkspace
        collapsedExplorerWidth={0}
        dataPort={dataPort}
        enableMarkdownLinkContentIndexing={false}
        explorerCollapseThreshold={180}
        explorerWidth={320}
        maxExplorerWidth={900}
        minExplorerWidth={240}
        resizableExplorer
        showHeader={false}
        workspace={{ id: "workspace", name: "Workspace", path: "/workspace", status: "recording" }}
        onExplorerCollapsedChange={onCollapsedChange}
        onExplorerWidthChange={onWidthChange}
      />,
    ));
    await Promise.resolve();
  });
  return container;
}

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

function requireHandle(container: HTMLElement, selector: string) {
  const handle = container.querySelector<HTMLElement>(selector);
  if (!handle) throw new Error(`Missing resize handle: ${selector}`);
  return handle;
}

function pointerEvent(type: string, clientX: number, pointerId: number) {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    pointerId,
  });
}
