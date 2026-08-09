/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DesktopCreateEntryDialog,
  type DesktopCreateEntryDraft,
} from "../src/features/data-workspace/nodeActions";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("App Preview creation dialog", () => {
  it("asks only for a name and never exposes or detects launch configuration", () => {
    const onCreate = vi.fn();
    const container = render(
      <DesktopCreateEntryDialog
        draft={createDraft()}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );

    expect(container.querySelectorAll("input")).toHaveLength(1);
    expect(container.textContent).not.toContain("Detected start options");
    expect(container.textContent).not.toContain("Start command");
    expect(findButton(container, "Create")?.disabled).toBe(false);

    act(() => findButton(container, "Create")?.click());
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(element)));
  return container;
}

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button"))
    .find((button) => button.textContent?.trim() === text);
}

function createDraft(): DesktopCreateEntryDraft {
  return {
    parentPath: null,
    anchor: { left: 20, top: 20, right: 44, bottom: 44, width: 24, height: 24 },
    error: null,
    creatingKind: null,
    selectedKind: "app",
    name: "Untitled App.puppyoneapp",
  };
}
