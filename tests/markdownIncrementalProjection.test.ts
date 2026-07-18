import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { markdownLivePreviewDecorations } from "../vendor/shared-ui/src/editor/markdown/core/decorations/livePreviewDecorations";
import {
  canIncrementallyUpdateMarkdownPlans,
  getMarkdownPlanIndex,
} from "../vendor/shared-ui/src/editor/markdown/core/plans/markdownPlanIndex";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../vendor/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";

function createLivePreviewState(source: string) {
  return EditorState.create({
    doc: source,
    extensions: [
      ...markdownCodeMirrorBaseExtensions(false),
      markdownLivePreviewExtension("safe", null, "note.md"),
    ],
  });
}

function summarizePlans(state: EditorState) {
  return getMarkdownPlanIndex(state).map(({ element, plan }) => ({
    kind: element.kind,
    from: element.from,
    to: element.to,
    presentation: plan.presentation,
    sourceRange: plan.sourceRange,
  }));
}

function summarizeDecorations(state: EditorState) {
  const ranges: Array<{ from: number; to: number; className: string | undefined; widget: string | undefined }> = [];
  state.field(markdownLivePreviewDecorations).decorations.between(0, state.doc.length, (from, to, decoration) => {
    ranges.push({
      from,
      to,
      className: decoration.spec.class,
      widget: decoration.spec.widget?.constructor.name,
    });
  });
  return ranges;
}

describe("Markdown incremental projection", () => {
  it("maps unaffected plans and patches only an ordinary changed source line", () => {
    const source = [
      "First paragraph with **bold** and [link](note.md).",
      "Second paragraph with _emphasis_ and <span style=\"color: red\">HTML</span>.",
      "Third paragraph stays untouched.",
    ].join("\n");
    const state = createLivePreviewState(source);
    const insertAt = source.indexOf("paragraph") + "paragraph".length;
    const transaction = state.update({ changes: { from: insertAt, insert: " updated" } });

    expect(canIncrementallyUpdateMarkdownPlans(transaction)).toBe(true);

    const next = transaction.state;
    const fresh = createLivePreviewState(next.doc.toString());
    expect(summarizePlans(next)).toEqual(summarizePlans(fresh));
    expect(summarizeDecorations(next)).toEqual(summarizeDecorations(fresh));
  });

  it("falls back to a complete projection when editing a fenced block payload", () => {
    const source = ["```ts", "const value = 1;", "```", "", "Ordinary paragraph."].join("\n");
    const state = createLivePreviewState(source);
    const transaction = state.update({
      changes: { from: source.indexOf("1"), to: source.indexOf("1") + 1, insert: "2" },
    });

    expect(canIncrementallyUpdateMarkdownPlans(transaction)).toBe(false);
    const next = transaction.state;
    const fresh = createLivePreviewState(next.doc.toString());
    expect(summarizePlans(next)).toEqual(summarizePlans(fresh));
    expect(summarizeDecorations(next)).toEqual(summarizeDecorations(fresh));
  });
});
