import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../../packages/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";
import "../../packages/shared-ui/src/styles/editor.css";

declare global {
  interface Window {
    markdownPaneFocusFixture?: {
      left: EditorView;
      right: EditorView;
      ready: boolean;
    };
  }
}

const source = Array.from({ length: 180 }, (_, index) => [
  `## Section ${index + 1}`,
  "",
  `Paragraph ${index + 1} keeps a realistic reading rail with **inline emphasis** and enough text to wrap across multiple visual rows in a narrow side-by-side pane.`,
  "",
]).flat().join("\n");

const left = createEditor(document.querySelector("#left"), source);
const right = createEditor(document.querySelector("#right"), source.slice(0, 4_000));

window.markdownPaneFocusFixture = { left, right, ready: false };
requestAnimationFrame(() => requestAnimationFrame(() => {
  if (window.markdownPaneFocusFixture) window.markdownPaneFocusFixture.ready = true;
}));

function createEditor(parent: Element | null, document: string): EditorView {
  if (!(parent instanceof HTMLElement)) throw new Error("Markdown fixture host is missing");
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: document,
      extensions: [
        ...markdownCodeMirrorBaseExtensions(false),
        markdownLivePreviewExtension("safe", null, "focus-continuity.md"),
      ],
    }),
  });
}
