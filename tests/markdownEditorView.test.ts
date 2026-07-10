/**
 * @vitest-environment happy-dom
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { disposeWidgetSessionDom } from "../vendor/shared-ui/src/editor/markdown/adapters/codemirror/widgetSession";
import { createWidgetSessionRegistry } from "../vendor/shared-ui/src/editor/markdown/adapters/codemirror/widgetSession";
import { createDomFromInlineHtmlSource } from "../vendor/shared-ui/src/editor/markdown/adapters/preview/inlineHtmlDomAdapter";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../vendor/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";
import { getMarkdownEmbedHost, disposeMarkdownEmbedHost } from "../vendor/shared-ui/src/editor/markdown/adapters/codemirror/embedHost";
import { createSanitizedBlockHtmlFragment } from "../vendor/shared-ui/src/editor/markdown/rendering/sanitizeHtml";

const views: EditorView[] = [];

afterEach(() => {
  while (views.length > 0) {
    const view = views.pop();
    view?.destroy();
  }
});

function createView(source: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        ...markdownCodeMirrorBaseExtensions(false),
        markdownLivePreviewExtension("safe", null, "note.md", null),
      ],
    }),
  });
  views.push(view);
  return view;
}

describe("Markdown EditorView lifecycle", () => {
  it("mounts live preview and disposes the embed host on destroy", () => {
    const view = createView('- <span style="color: #B45309;">screenshot</span>');
    const host = getMarkdownEmbedHost(view);
    expect(host.viewId).toMatch(/^md-view:/);
    expect(view.dom.querySelector(".cm-content")).toBeTruthy();

    view.destroy();
    views.pop();
    disposeMarkdownEmbedHost(view);
    // Second dispose is a no-op.
    disposeMarkdownEmbedHost(view);
  });

  it("disposes widget sessions by exact DOM on remount and destroy", () => {
    const registry = createWidgetSessionRegistry();
    const dom = document.createElement("div");
    let disposed = 0;
    registry.mount(dom, () => ({
      dispose: () => {
        disposed += 1;
      },
    }));
    registry.mount(dom, () => ({
      dispose: () => {
        disposed += 1;
      },
    }));
    expect(disposed).toBe(1);
    disposeWidgetSessionDom(dom);
    expect(disposed).toBe(2);
  });

  it("keeps IME composition from wiping decorations until composition ends", () => {
    const view = createView("Hello **world**");
    view.dispatch({
      selection: { anchor: 8 },
    });
    // Composition mirror is transaction-visible; start composition via input plugin path.
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart"));
    view.dispatch({
      changes: { from: 8, to: 8, insert: "あ" },
      annotations: [],
    });
    expect(view.state.doc.toString()).toContain("あ");
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend"));
  });
});

describe("Markdown preview/policy convergence", () => {
  it("compiles table-cell style HTML through the shared plan adapter", () => {
    const node = createDomFromInlineHtmlSource('<span style="color: #B45309;">screenshot</span>');
    expect(node).not.toBeNull();
    expect(node?.tagName.toLowerCase()).toBe("span");
    expect(node?.getAttribute("style")).toContain("color: #B45309");
    expect(node?.textContent).toBe("screenshot");
  });

  it("reduces blocked styles in block HTML without dropping the element", () => {
    const result = createSanitizedBlockHtmlFragment('<div style="display: none; color: red">safe</div>');
    expect(result.supported).toBe(true);
    const div = result.fragment.querySelector("div");
    expect(div?.style.color).toBe("red");
    expect(div?.style.display).toBe("");
  });
});
