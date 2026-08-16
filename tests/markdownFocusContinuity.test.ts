/** @vitest-environment happy-dom */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../packages/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";

const views: EditorView[] = [];

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Markdown focus scroll continuity", () => {
  it("captures an editor-local scroll snapshot for every focus boundary", async () => {
    const left = createView("Left **document**\n\nMore content");
    const right = createView("Right **document**\n\nMore content");
    const leftSnapshot = vi.spyOn(left, "scrollSnapshot");
    const rightSnapshot = vi.spyOn(right, "scrollSnapshot");

    left.focus();
    await settleFocusChange();
    expect(leftSnapshot).toHaveBeenCalledTimes(1);
    expect(rightSnapshot).not.toHaveBeenCalled();

    right.focus();
    await settleFocusChange();
    expect(leftSnapshot).toHaveBeenCalledTimes(2);
    expect(rightSnapshot).toHaveBeenCalledTimes(1);

    left.focus();
    await settleFocusChange();
    expect(leftSnapshot).toHaveBeenCalledTimes(3);
    expect(rightSnapshot).toHaveBeenCalledTimes(2);
  });
});

function createView(source: string): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        ...markdownCodeMirrorBaseExtensions(false),
        markdownLivePreviewExtension("safe", null, "note.md"),
      ],
    }),
  });
  views.push(view);
  return view;
}

async function settleFocusChange() {
  await new Promise((resolve) => window.setTimeout(resolve, 20));
}
