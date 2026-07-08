import { EditorState, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import {
  markdownAssetUrlResolverFacet,
  markdownDocumentPathFacet,
  markdownHtmlTrustModeFacet,
  markdownLinkGraphFacet,
} from "../markdownLivePreviewContext";
import { getComposingBlockLineKey, getInputCompositionState, markdownComposingBlockLineField } from "../state/composingBlockLine";
import { markdownExpandedImageField } from "../state/expandedImage";
import { getLivePreviewFocusState } from "../state/livePreviewFocus";
import { getInlineRevealElement } from "../syntax/markdownElements";
import { addMarkdownBlockAndLineDecorations } from "./blockDecorations";
import type { InlineRevealRange, MarkdownDecorationBuilders } from "./decorationPrimitives";

type LivePreviewDecorations = {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
  focused: boolean;
  inputComposing: boolean;
  composingLineKey: string;
  revealSetKey: string;
};

export const markdownLivePreviewDecorations = StateField.define<LivePreviewDecorations>({
  create(state) {
    return buildMarkdownDecorations(state, false, false);
  },
  update(decorations, transaction) {
    const focused = getLivePreviewFocusState(decorations.focused, transaction.effects);
    const inputComposing = getInputCompositionState(decorations.inputComposing, transaction.effects);
    const composingLineKey = getComposingBlockLineKey(transaction.state);
    const revealSetKey = getLivePreviewRevealSetKey(transaction.state, focused);
    if (inputComposing && transaction.docChanged && !transaction.reconfigured) {
      return {
        decorations: decorations.decorations.map(transaction.changes),
        atomicRanges: decorations.atomicRanges.map(transaction.changes),
        focused,
        inputComposing,
        composingLineKey,
        revealSetKey: decorations.revealSetKey,
      };
    }
    if (
      transaction.docChanged ||
      transaction.reconfigured ||
      focused !== decorations.focused ||
      inputComposing !== decorations.inputComposing ||
      composingLineKey !== decorations.composingLineKey ||
      revealSetKey !== decorations.revealSetKey
    ) {
      return buildMarkdownDecorations(transaction.state, focused, inputComposing);
    }
    return {
      decorations: decorations.decorations.map(transaction.changes),
      atomicRanges: decorations.atomicRanges.map(transaction.changes),
      focused,
      inputComposing,
      composingLineKey,
      revealSetKey,
    };
  },
  provide(field) {
    return [
      EditorView.decorations.from(field, (value) => value.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(field).atomicRanges),
    ];
  },
});

function getLivePreviewRevealSetKey(state: EditorState, focused: boolean): string {
  const inlineRevealRange = getLivePreviewInlineRevealRange(state, focused);
  return inlineRevealRange ? `${inlineRevealRange.from}:${inlineRevealRange.to}` : "";
}

function getLivePreviewInlineRevealRange(state: EditorState, focused: boolean): InlineRevealRange | null {
  if (!focused || state.readOnly || state.selection.ranges.length !== 1) return null;

  const selection = state.selection.main;
  if (!selection.empty) return null;

  const element = getInlineRevealElement(state, selection.from);
  return element ? { from: element.from, to: element.to } : null;
}

function buildMarkdownDecorations(state: EditorState, focused: boolean, inputComposing: boolean): LivePreviewDecorations {
  const builders: MarkdownDecorationBuilders = {
    decorations: [],
    atomicRanges: [],
  };
  const inlineRevealRange = getLivePreviewInlineRevealRange(state, focused);
  const composingLine = state.field(markdownComposingBlockLineField, false) ?? null;
  const expandedImageRange = state.field(markdownExpandedImageField, false) ?? null;

  addMarkdownBlockAndLineDecorations(
    state,
    builders,
    inlineRevealRange,
    expandedImageRange,
    composingLine,
    state.facet(markdownHtmlTrustModeFacet),
    state.facet(markdownLinkGraphFacet),
    state.facet(markdownDocumentPathFacet),
    state.facet(markdownAssetUrlResolverFacet),
  );

  return {
    decorations: builders.decorations.length > 0 ? Decoration.set(builders.decorations, true) : Decoration.none,
    atomicRanges: builders.atomicRanges.length > 0 ? Decoration.set(builders.atomicRanges, true) : Decoration.none,
    focused,
    inputComposing,
    composingLineKey: composingLine ? `${composingLine.from}:${composingLine.to}` : "",
    revealSetKey: inlineRevealRange ? `${inlineRevealRange.from}:${inlineRevealRange.to}` : "",
  };
}
