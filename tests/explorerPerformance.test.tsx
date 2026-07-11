/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataNode } from "../vendor/shared-ui/src/core/types";
import { ExplorerTree } from "../vendor/shared-ui/src/data/ExplorerTree";
import {
  buildExplorerVisibleModel,
} from "../vendor/shared-ui/src/data/explorer/explorerVisibleModel";
import { ExplorerRowStateStore } from "../vendor/shared-ui/src/data/explorer/explorerRowStateStore";
import { EXPLORER_VIRTUAL_MAX_MOUNTED_ROWS } from "../vendor/shared-ui/src/data/explorer/useExplorerVirtualWindow";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Explorer bounded rendering", () => {
  it("builds a stable flattened navigation model independent of selection", () => {
    const nodes: DataNode[] = [{
      id: "folder",
      name: "folder",
      path: "folder",
      type: "folder",
      children: [
        { id: "a", name: "a.md", path: "folder/a.md", type: "markdown" },
        { id: "b", name: "b.md", path: "folder/b.md", type: "markdown" },
      ],
    }];
    const model = buildExplorerVisibleModel(nodes, { expandedPaths: new Set(["folder"]) });

    expect(model.rows.map((row) => row.kind === "node" ? row.path : row.key)).toEqual([
      "folder",
      "folder/a.md",
      "folder/b.md",
    ]);
    expect(model.pathToIndex.get("folder/b.md")).toBe(2);
    expect(model.pathToNode.get("folder/a.md")?.name).toBe("a.md");
  });

  it("mounts at most the hard row limit for 1,000 visible nodes", () => {
    const nodes = makeNodes(1_000);
    const container = renderExplorer({ nodes, activePath: nodes[0]?.path ?? null });
    const canvas = container.querySelector<HTMLElement>(".explorer-tree-virtual-canvas");

    expect(canvas?.dataset.visibleRowCount).toBe("1000");
    expect(Number(canvas?.dataset.mountedRowCount)).toBeLessThanOrEqual(EXPLORER_VIRTUAL_MAX_MOUNTED_ROWS);
    expect(container.querySelectorAll("[role=treeitem]").length).toBeLessThanOrEqual(
      EXPLORER_VIRTUAL_MAX_MOUNTED_ROWS,
    );
  });

  it("notifies only the old and new rows for an ordinary single selection", () => {
    const store = new ExplorerRowStateStore();
    const empty = new Set<string>();
    store.prepare({
      activePath: "a",
      selectedPaths: new Set(["a"]),
      cutPaths: empty,
      loadingPaths: empty,
      draggedPaths: empty,
      dropTarget: null,
    }, ["a", "b", "c"]);
    store.flush();

    const listeners = { a: vi.fn(), b: vi.fn(), c: vi.fn() };
    const disposers = Object.entries(listeners).map(([path, listener]) => store.subscribe(path, listener));
    store.prepare({
      activePath: "b",
      selectedPaths: new Set(["b"]),
      cutPaths: empty,
      loadingPaths: empty,
      draggedPaths: empty,
      dropTarget: null,
    }, ["a", "b", "c"]);

    expect([...store.getPendingNotificationPaths()].sort()).toEqual(["a", "b"]);
    store.flush();
    expect(listeners.a).toHaveBeenCalledTimes(1);
    expect(listeners.b).toHaveBeenCalledTimes(1);
    expect(listeners.c).not.toHaveBeenCalled();
    disposers.forEach((dispose) => dispose());
  });

  it("keeps keyboard navigation and additive/range selection on the full model", () => {
    const nodes = makeNodes(200);
    const onSelectNode = vi.fn();
    const container = renderExplorer({ nodes, activePath: nodes[0]?.path ?? null, onSelectNode });
    const first = container.querySelector<HTMLButtonElement>(`[data-explorer-path="${nodes[0]?.path}"]`)!;

    act(() => first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(onSelectNode).toHaveBeenCalledWith(nodes[1], undefined);

    act(() => first.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true })));
    expect(onSelectNode).toHaveBeenLastCalledWith(nodes[0], expect.objectContaining({ additive: true }));

    act(() => first.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
    expect(onSelectNode).toHaveBeenLastCalledWith(nodes[0], expect.objectContaining({ range: true }));
  });

  it("preserves folder drag/drop behavior with virtualized rows", () => {
    const source: DataNode = { id: "source", name: "source.md", path: "source.md", type: "markdown" };
    const target: DataNode = { id: "target", name: "target", path: "target", type: "folder", children: [] };
    const onMoveNode = vi.fn(async () => undefined);
    const container = renderExplorer({
      nodes: [source, target],
      activePath: source.path,
      canMoveNodes: true,
      onMoveNode,
    });
    const sourceRow = container.querySelector<HTMLButtonElement>(`[data-explorer-path="${source.path}"]`)!;
    const targetRow = container.querySelector<HTMLButtonElement>(`[data-explorer-path="${target.path}"]`)!;
    Object.defineProperty(targetRow, "getBoundingClientRect", {
      value: () => ({ top: 0, bottom: 30, left: 0, right: 240, width: 240, height: 30, x: 0, y: 0, toJSON() {} }),
    });
    const dataTransfer = new DataTransfer();
    const dragEvent = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, clientY: 5 });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      return event;
    };

    act(() => sourceRow.dispatchEvent(dragEvent("dragstart")));
    act(() => targetRow.dispatchEvent(dragEvent("dragover")));
    act(() => targetRow.dispatchEvent(dragEvent("drop")));

    expect(onMoveNode).toHaveBeenCalledWith(source, target.path);
  });
});

function renderExplorer({
  nodes,
  activePath,
  onSelectNode = vi.fn(),
  canMoveNodes = false,
  onMoveNode,
}: {
  nodes: DataNode[];
  activePath: string | null;
  onSelectNode?: (node: DataNode | null, intent?: { additive?: boolean; range?: boolean }) => void;
  canMoveNodes?: boolean;
  onMoveNode?: (node: DataNode, targetFolderPath: string | null) => void | Promise<void>;
}) {
  const container = document.createElement("div");
  Object.assign(container.style, { width: "320px", height: "640px" });
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(
    <ExplorerTree
      nodes={nodes}
      activePath={activePath}
      selectedPaths={activePath ? new Set([activePath]) : new Set()}
      expandedPaths={new Set()}
      showRoot={false}
      canMoveNodes={canMoveNodes}
      onMoveNode={onMoveNode}
      onSelectNode={onSelectNode}
    />,
  ));
  return container;
}

function makeNodes(count: number): DataNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `node-${index}`,
    name: `document-${index}.md`,
    path: `document-${index}.md`,
    type: "markdown" as const,
  }));
}
