/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  EditorPaneMenuContributionProvider,
  type EditorPaneMenuContribution,
} from "../packages/shared-ui/src/editor/editorPaneMenuContribution";
import { TextEditorFrame } from "../packages/shared-ui/src/editor/viewers/shared/TextEditorFrame";
import { testT, withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("editor mode toggle", () => {
  it("publishes Source Code into the pane menu instead of rendering editor chrome", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    let contribution: EditorPaneMenuContribution | null = null;

    act(() => root?.render(withTestLocalization(
      <EditorPaneMenuContributionProvider
        onContributionChange={(nextContribution) => {
          contribution = nextContribution;
        }}
      >
        <TextEditorFrame
          documentId="mode.md"
          content="# Heading"
          nodeName="mode.md"
          defaultMode="live"
          canEdit
          hideSourceView={false}
          modeControlPlacement="pane-menu"
          renderLive={() => <output data-editor-mode="live" />}
          renderSource={() => <output data-editor-mode="source" />}
        />
      </EditorPaneMenuContributionProvider>,
    )));

    expect(container.querySelector('[data-editor-mode="live"]')).not.toBeNull();
    expect(container.querySelector('[data-editor-mode="source"]')).toBeNull();
    expect(container.querySelector(".editor-mode-toggle")).toBeNull();
    expect(contribution).toMatchObject({
      documentId: "mode.md",
      viewItems: [{
        kind: "toggle",
        id: "editor-source-mode",
        label: testT("editor.mode.source"),
        checked: false,
      }],
    });

    const sourceModeItem = contribution?.viewItems[0];
    expect(sourceModeItem?.kind).toBe("toggle");
    act(() => {
      if (sourceModeItem?.kind === "toggle") sourceModeItem.setChecked(true);
    });

    expect(container.querySelector('[data-editor-mode="live"]')).toBeNull();
    expect(container.querySelector('[data-editor-mode="source"]')).not.toBeNull();
    expect(contribution?.viewItems[0]).toMatchObject({ checked: true });
  });

  it.each([
    ["Command", { metaKey: true }],
    ["Control", { ctrlKey: true }],
  ])("toggles preview/source mode with %s shortcut", (_modifierName, modifier) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TextEditorFrame
        documentId="mode-shortcut.md"
        content="# Heading"
        nodeName="mode-shortcut.md"
        defaultMode="live"
        canEdit
        hideSourceView={false}
        enableModeToggleShortcut
        renderLive={() => <button type="button" data-editor-mode="live">live</button>}
        renderSource={() => <button type="button" data-editor-mode="source">source</button>}
      />,
    )));

    const liveButton = container.querySelector<HTMLButtonElement>('[data-editor-mode="live"]');
    liveButton?.focus();

    expect(container.querySelector('[data-editor-mode="live"]')).not.toBeNull();
    expect(container.querySelector('[data-editor-mode="source"]')).toBeNull();

    act(() => {
      liveButton?.dispatchEvent(new KeyboardEvent("keydown", {
        key: "/",
        ...modifier,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(container.querySelector('[data-editor-mode="live"]')).toBeNull();
    expect(container.querySelector('[data-editor-mode="source"]')).not.toBeNull();
  });
});
