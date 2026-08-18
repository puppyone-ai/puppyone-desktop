/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { TextEditorFrame } from "../packages/shared-ui/src/editor/viewers/shared/TextEditorFrame";
import { testT, withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const editorChromeCss = read("../packages/shared-ui/src/styles/editor/editor-chrome.css");

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("editor mode toggle", () => {
  it("keeps the control on the editor's logical starting edge", () => {
    const rule = readCssBlock(editorChromeCss, ".editor-mode-toggle");

    expect(rule).toContain("inset-inline-start: 12px;");
    expect(rule).not.toMatch(/\bright\s*:/);
    expect(rule).not.toContain("inset-inline-end:");
  });

  it("switches from Live View to Source Code", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <TextEditorFrame
        documentId="mode.md"
        content="# Heading"
        nodeName="mode.md"
        defaultMode="live"
        canEdit
        hideSourceView={false}
        renderLive={() => <output data-editor-mode="live" />}
        renderSource={() => <output data-editor-mode="source" />}
      />,
    )));

    expect(container.querySelector('[data-editor-mode="live"]')).not.toBeNull();
    expect(container.querySelector('[data-editor-mode="source"]')).toBeNull();

    const sourceButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${testT("editor.mode.source")}"]`,
    );
    act(() => sourceButton?.click());

    expect(container.querySelector('[data-editor-mode="live"]')).toBeNull();
    expect(container.querySelector('[data-editor-mode="source"]')).not.toBeNull();
  });

  it("toggles preview/source mode with keyboard shortcut", () => {
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
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(container.querySelector('[data-editor-mode="live"]')).toBeNull();
    expect(container.querySelector('[data-editor-mode="source"]')).not.toBeNull();
  });
});

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readCssBlock(css: string, selector: string) {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Missing CSS block for ${selector}`);
  const bodyStart = start + marker.length;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS block for ${selector}`);
  return css.slice(bodyStart, end);
}
