/** @vitest-environment happy-dom */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { markdownLivePreviewDecorations } from "../packages/shared-ui/src/editor/markdown/core/decorations/livePreviewDecorations";
import { MarkdownLinkInteractionSession } from "../packages/shared-ui/src/editor/markdown/core/state/markdownLinkInteraction";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../packages/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";
import type { MarkdownLinkGraph } from "../packages/shared-ui/src/editor/registry/viewerTypes";

const views: EditorView[] = [];

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy();
  document.body.innerHTML = "";
});

describe("Markdown pane-owned view state", () => {
  it("keeps each visible pane's reveal projection stable across sibling focus", async () => {
    const source = [
      "| Name | Value |",
      "| --- | --- |",
      "| row | stable |",
      "",
      "Paragraph below the table with **pane-local source** and trailing text.",
    ].join("\n");
    const left = createView(source, null, "left.md");
    const right = createView(source, null, "right.md");
    const leftCaret = source.indexOf("pane-local source") + 4;
    const rightCaret = source.indexOf("pane-local source") + 9;
    left.dispatch({ selection: { anchor: leftCaret } });
    right.dispatch({ selection: { anchor: rightCaret } });

    left.focus();
    await settleFocusChange();
    const leftActive = projectionSnapshot(left);
    const leftHtml = left.contentDOM.innerHTML;
    const leftTable = left.dom.querySelector(".cm-md-table-widget");
    expect(leftActive.focused).toBe(true);
    expect(leftActive.revealRange).not.toBeNull();
    expect(leftTable).not.toBeNull();

    right.focus();
    await settleFocusChange();
    const leftInactive = projectionSnapshot(left);
    const rightActive = projectionSnapshot(right);

    expect(leftInactive).toEqual({ ...leftActive, focused: false });
    expect(left.contentDOM.innerHTML).toBe(leftHtml);
    expect(left.dom.querySelector(".cm-md-table-widget")).toBe(leftTable);
    expect(rightActive.focused).toBe(true);
    expect(rightActive.revealRange).not.toBeNull();

    left.focus();
    await settleFocusChange();
    expect(projectionSnapshot(right)).toEqual({ ...rightActive, focused: false });
  });

  it("does not let one pane consume another pane's link click", () => {
    const left = new MarkdownLinkInteractionSession();
    const right = new MarkdownLinkInteractionSession();

    left.recordHandledMouseDown(1_000);
    expect(right.consumeDuplicateClick(1_100)).toBe(false);
    expect(left.consumeDuplicateClick(1_100)).toBe(true);
    expect(left.consumeDuplicateClick(1_101)).toBe(false);
  });
});

function createView(
  source: string,
  linkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  readOnly = false,
): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        ...markdownCodeMirrorBaseExtensions(readOnly),
        markdownLivePreviewExtension("safe", linkGraph, documentPath),
      ],
    }),
  });
  views.push(view);
  return view;
}

function projectionSnapshot(view: EditorView) {
  const projection = view.state.field(markdownLivePreviewDecorations);
  return {
    focused: projection.focused,
    revealRange: projection.revealRange
      ? { from: projection.revealRange.from, to: projection.revealRange.to }
      : null,
  };
}

async function settleFocusChange() {
  await new Promise((resolve) => window.setTimeout(resolve, 20));
}
