/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPLORER_REFERENCE_DRAG_TYPE,
  ExplorerTree,
  classifyReferenceDataTransfer,
  parseExplorerReferenceDrag,
  type DataNode,
} from "@puppyone/shared-ui";
import { renderWithTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ExplorerTree interactive semantics", () => {
  it("keeps row actions outside button ancestry and preserves keyboard activation", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onSelectNode = vi.fn();
    const onAction = vi.fn();
    const node: DataNode = {
      id: "readme",
      name: "README.md",
      path: "README.md",
      type: "markdown",
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <ExplorerTree
        nodes={[node]}
        activePath={node.path}
        selectedPaths={new Set([node.path])}
        expandedPaths={new Set()}
        showRoot={false}
        onSelectNode={onSelectNode}
        renderNodeActions={() => (
          <button type="button" aria-label="More actions" onClick={onAction}>More</button>
        )}
      />,
    ));

    const row = container.querySelector<HTMLElement>("[role='treeitem']");
    const action = container.querySelector<HTMLButtonElement>("[aria-label='More actions']");
    expect(row?.tagName).toBe("DIV");
    expect(row?.querySelector("button")).toBe(action);
    expect(container.querySelector("button button")).toBeNull();
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("validateDOMNesting");

    act(() => row?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onSelectNode).toHaveBeenCalledWith(node, undefined);

    onSelectNode.mockClear();
    act(() => action?.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it("keeps outbound reference drag available when in-tree move is read-only", () => {
    const nodes: DataNode[] = [
      { id: "readme", name: "README.md", path: "README.md", type: "markdown" },
    ];
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => renderWithTestLocalization(root,
      <ExplorerTree
        nodes={nodes}
        activePath={nodes[0].path}
        selectedPaths={new Set(nodes.map((node) => node.path))}
        expandedPaths={new Set()}
        showRoot={false}
        dragWorkspaceId="workspace-1"
        canMoveNodes={false}
        onSelectNode={vi.fn()}
      />,
    ));

    const row = container.querySelector<HTMLElement>("[role='treeitem']");
    const transfer = fakeDataTransfer();
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    expect(row?.getAttribute("draggable")).toBe("true");
    act(() => row?.dispatchEvent(event));

    expect(transfer.effectAllowed).toBe("copy");
    const payload = parseExplorerReferenceDrag(transfer.getData(EXPLORER_REFERENCE_DRAG_TYPE));
    expect(payload).toMatchObject({
      version: 1,
      workspaceId: "workspace-1",
      entries: [{ path: "README.md", entryType: "file" }],
    });
    expect(classifyReferenceDataTransfer(transfer)).toMatchObject({ kind: "workspace-entries", typed: true });
  });

  it("keeps the internal move session across same-frame native events and window blur", () => {
    const source: DataNode = {
      id: "drag-me",
      name: "drag-me.txt",
      path: "drag-me.txt",
      type: "text",
    };
    const target: DataNode = {
      id: "target",
      name: "target",
      path: "target",
      type: "folder",
      children: [],
    };
    const onMoveNode = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => renderWithTestLocalization(root,
      <ExplorerTree
        nodes={[source, target]}
        activePath={null}
        expandedPaths={new Set()}
        showRoot={false}
        dragWorkspaceId="workspace-1"
        canMoveNodes
        onSelectNode={vi.fn()}
        onMoveNode={onMoveNode}
      />,
    ));

    const sourceRow = container.querySelector<HTMLElement>(`[data-explorer-path="${source.path}"]`)!;
    const targetRow = container.querySelector<HTMLElement>(`[data-explorer-path="${target.path}"]`)!;
    mockRowBounds(targetRow);
    const transfer = fakeDataTransfer();

    act(() => {
      sourceRow.dispatchEvent(dragEvent("dragstart", transfer));
      window.dispatchEvent(new Event("blur"));
      targetRow.dispatchEvent(dragEvent("dragover", transfer));
      targetRow.dispatchEvent(dragEvent("drop", transfer));
    });

    expect(onMoveNode).toHaveBeenCalledWith(source, target.path);
  });

  it("moves a nested file back to its parent folder through the batch callback", async () => {
    const source: DataNode = {
      id: "parent-child-drag-me",
      name: "drag-me.txt",
      path: "parent/child/drag-me.txt",
      type: "text",
    };
    const child: DataNode = {
      id: "parent-child",
      name: "child",
      path: "parent/child",
      type: "folder",
      children: [source],
    };
    const parent: DataNode = {
      id: "parent",
      name: "parent",
      path: "parent",
      type: "folder",
      children: [child],
    };
    const onMoveNodes = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => renderWithTestLocalization(root,
      <ExplorerTree
        nodes={[parent]}
        activePath={source.path}
        selectedPaths={new Set([source.path])}
        expandedPaths={new Set([parent.path, child.path])}
        showRoot={false}
        dragWorkspaceId="workspace-1"
        canMoveNodes
        onSelectNode={vi.fn()}
        onMoveNodes={onMoveNodes}
      />,
    ));

    const sourceRow = container.querySelector<HTMLElement>(`[data-explorer-path="${source.path}"]`)!;
    const parentRow = container.querySelector<HTMLElement>(`[data-explorer-path="${parent.path}"]`)!;
    mockRowBounds(parentRow);
    const transfer = fakeDataTransfer();

    await act(async () => {
      sourceRow.dispatchEvent(dragEvent("dragstart", transfer));
      parentRow.dispatchEvent(dragEvent("dragover", transfer));
      parentRow.dispatchEvent(dragEvent("drop", transfer));
      await Promise.resolve();
    });

    expect(onMoveNodes).toHaveBeenCalledWith([source], parent.path);
  });

  it("recovers an internal move from the typed native drag payload", async () => {
    const source: DataNode = {
      id: "payload-source",
      name: "drag-me.txt",
      path: "parent/child/drag-me.txt",
      type: "text",
    };
    const child: DataNode = {
      id: "payload-child",
      name: "child",
      path: "parent/child",
      type: "folder",
      children: [source],
    };
    const parent: DataNode = {
      id: "payload-parent",
      name: "parent",
      path: "parent",
      type: "folder",
      children: [child],
    };
    const onMoveNodes = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => renderWithTestLocalization(root,
      <ExplorerTree
        nodes={[parent]}
        activePath={source.path}
        selectedPaths={new Set([source.path])}
        expandedPaths={new Set([parent.path, child.path])}
        showRoot={false}
        dragWorkspaceId="workspace-1"
        canMoveNodes
        onSelectNode={vi.fn()}
        onMoveNodes={onMoveNodes}
      />,
    ));

    const parentRow = container.querySelector<HTMLElement>(`[data-explorer-path="${parent.path}"]`)!;
    mockRowBounds(parentRow);
    const transfer = fakeDataTransfer();
    transfer.setData(EXPLORER_REFERENCE_DRAG_TYPE, JSON.stringify({
      version: 1,
      workspaceId: "workspace-1",
      entries: [{
        path: source.path,
        name: source.name,
        entryType: "file",
      }],
    }));

    await act(async () => {
      parentRow.dispatchEvent(dragEvent("dragover", transfer));
      parentRow.dispatchEvent(dragEvent("drop", transfer));
      await Promise.resolve();
    });

    expect(onMoveNodes).toHaveBeenCalledWith([source], parent.path);
  });

  it("clears external-file drop feedback when the drag leaves the tree", () => {
    const folder: DataNode = {
      id: "recordings",
      name: "recordings",
      path: "recordings",
      type: "folder",
      children: [],
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => renderWithTestLocalization(root,
      <ExplorerTree
        nodes={[folder]}
        activePath={null}
        expandedPaths={new Set()}
        showRoot={false}
        onSelectNode={vi.fn()}
        onImportFiles={vi.fn()}
      />,
    ));

    const row = container.querySelector<HTMLElement>(`[data-explorer-path="${folder.path}"]`)!;
    mockRowBounds(row);
    const transfer = fakeFileDataTransfer();

    act(() => row.dispatchEvent(dragEvent("dragenter", transfer)));
    expect(row.classList.contains("drop-target")).toBe(true);

    act(() => row.dispatchEvent(dragEvent("dragleave", transfer)));
    expect(row.classList.contains("drop-target")).toBe(false);
  });

  it("clears external-file drop feedback for global drag cancellation signals", () => {
    const folder: DataNode = {
      id: "recordings",
      name: "recordings",
      path: "recordings",
      type: "folder",
      children: [],
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => renderWithTestLocalization(root,
      <ExplorerTree
        nodes={[folder]}
        activePath={null}
        expandedPaths={new Set()}
        showRoot={false}
        onSelectNode={vi.fn()}
        onImportFiles={vi.fn()}
      />,
    ));

    const row = container.querySelector<HTMLElement>(`[data-explorer-path="${folder.path}"]`)!;
    mockRowBounds(row);
    const transfer = fakeFileDataTransfer();
    const cancellations = [
      () => window.dispatchEvent(new Event("dragend")),
      () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
      () => window.dispatchEvent(new Event("blur")),
    ];

    for (const cancel of cancellations) {
      act(() => row.dispatchEvent(dragEvent("dragenter", transfer)));
      expect(row.classList.contains("drop-target")).toBe(true);
      act(() => cancel());
      expect(row.classList.contains("drop-target")).toBe(false);
    }
  });
});

function fakeDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  const types: string[] = [];
  const transfer = {
    effectAllowed: "none",
    dropEffect: "none",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types,
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => {
      values.set(type, value);
      types.splice(0, types.length, ...values.keys());
    },
    clearData: (type?: string) => type ? values.delete(type) : values.clear(),
    setDragImage: () => undefined,
  } as DataTransfer;
  return transfer;
}

function fakeFileDataTransfer(): DataTransfer {
  const transfer = fakeDataTransfer();
  (transfer.types as string[]).push("Files");
  return transfer;
}

function dragEvent(type: string, dataTransfer: DataTransfer): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 12,
    clientY: 5,
  });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  return event;
}

function mockRowBounds(row: HTMLElement) {
  Object.defineProperty(row, "getBoundingClientRect", {
    value: () => ({
      top: 0,
      bottom: 30,
      left: 0,
      right: 240,
      width: 240,
      height: 30,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  });
}
