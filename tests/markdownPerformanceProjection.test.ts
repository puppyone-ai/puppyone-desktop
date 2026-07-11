import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../vendor/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";
import {
  getMarkdownProjectionDiagnostics,
  markdownLivePreviewDecorations,
  requestMarkdownProjectionRange,
  resetMarkdownProjectionDiagnostics,
} from "../vendor/shared-ui/src/editor/markdown/core/decorations/livePreviewDecorations";
import {
  getMarkdownDecorationDiagnostics,
  resetMarkdownDecorationDiagnostics,
} from "../vendor/shared-ui/src/editor/markdown/core/decorations/blockDecorations";
import {
  getMarkdownPlanIndexDiagnostics,
  resetMarkdownPlanIndexDiagnostics,
} from "../vendor/shared-ui/src/editor/markdown/core/plans/markdownPlanIndex";
import { markdownLivePreviewFocusEffect } from "../vendor/shared-ui/src/editor/markdown/core/state/livePreviewFocus";

describe("Markdown incremental document projection", () => {
  it("patches a 10,000-line single-character edit without a full scan or plan rebuild", () => {
    let state = createState(makeMarkdown(10_000));
    const line = state.doc.line(5_000);
    state = state.update({
      effects: requestMarkdownProjectionRange(state, line.from, line.to),
    }).state;

    resetMarkdownProjectionDiagnostics();
    resetMarkdownDecorationDiagnostics();
    resetMarkdownPlanIndexDiagnostics();
    state = state.update({
      changes: { from: line.from + 2, to: line.from + 3, insert: "x" },
    }).state;

    expect(state.field(markdownLivePreviewDecorations).decorations.size).toBeGreaterThan(0);
    expect(getMarkdownDecorationDiagnostics()).toMatchObject({ fullDocumentScans: 0 });
    expect(getMarkdownDecorationDiagnostics().linesScanned).toBeLessThanOrEqual(8);
    expect(getMarkdownPlanIndexDiagnostics().fullBuilds).toBe(0);
    expect(getMarkdownProjectionDiagnostics().mappedTransactions).toBeGreaterThanOrEqual(1);
  });

  it("rebuilds only the old/new reveal block when focus changes", () => {
    const source = makeMarkdown(10_000);
    let state = createState(source);
    const position = source.indexOf("bold") + 2;
    state = state.update({
      selection: EditorSelection.cursor(position),
      effects: requestMarkdownProjectionRange(state, position, position + 1),
    }).state;

    resetMarkdownDecorationDiagnostics();
    resetMarkdownProjectionDiagnostics();
    state = state.update({
      selection: EditorSelection.cursor(position),
      effects: markdownLivePreviewFocusEffect.of(true),
    }).state;

    expect(getMarkdownDecorationDiagnostics().fullDocumentScans).toBe(0);
    expect(getMarkdownDecorationDiagnostics().linesScanned).toBeLessThanOrEqual(6);
    expect(getMarkdownProjectionDiagnostics().focusRevealPatches).toBeGreaterThan(0);
  });

  it("keeps structural table decoration in CodeMirror layout after a local edit", () => {
    let state = createState([
      "# Table",
      "",
      "| Name | Value |",
      "| --- | ---: |",
      "| A | 1 |",
      "| B | 2 |",
      "",
      "Tail",
    ].join("\n"));
    const tableLine = state.doc.line(5);
    state = state.update({
      effects: requestMarkdownProjectionRange(state, tableLine.from, tableLine.to),
    }).state;
    state = state.update({
      changes: { from: tableLine.from + 2, to: tableLine.from + 3, insert: "C" },
    }).state;

    let blockReplacementCount = 0;
    state.field(markdownLivePreviewDecorations).decorations.between(0, state.doc.length, (_from, _to, value) => {
      if (value.spec.widget) blockReplacementCount += 1;
    });
    expect(blockReplacementCount).toBeGreaterThan(0);
  });
});

function createState(source: string): EditorState {
  return EditorState.create({
    doc: source,
    extensions: [
      ...markdownCodeMirrorBaseExtensions(false),
      markdownLivePreviewExtension("safe", null, "performance.md"),
    ],
  });
}

function makeMarkdown(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, index) => (
    index % 40 === 0
      ? `# Heading ${index}`
      : `Paragraph ${index} with **bold**, _emphasis_, and [link](note-${index % 30}.md).`
  )).join("\n");
}
