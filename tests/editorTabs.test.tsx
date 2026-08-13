/** @vitest-environment happy-dom */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorTabs } from "../packages/shared-ui/src/editor/workbench/EditorTabs";
import { createEditorInput } from "../packages/shared-ui/src/editor/workbench/editorGroupModel";
import { withTestLocalization } from "./testLocalization";

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("EditorTabs", () => {
  it("exposes an accessible tablist and keyboard activation/close controls", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onActivate = vi.fn();
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <EditorTabs
        editors={[createEditorInput("a.md"), createEditorInput("b.md")]}
        activeEditorId="a.md"
        workingCopyStatuses={new Map([["a.md", "dirty"]])}
        onActivate={onActivate}
        onClose={onClose}
      />,
    )));

    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container.querySelector('.editor-tab[data-dirty="true"]')).not.toBeNull();
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);

    act(() => tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(onActivate).toHaveBeenCalledWith("b.md");
    act(() => tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
    expect(onClose).toHaveBeenCalledWith("a.md");
  });
});
