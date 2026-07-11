/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplorerTree, type DataNode } from "@puppyone/shared-ui";

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

    act(() => root?.render(
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
});
