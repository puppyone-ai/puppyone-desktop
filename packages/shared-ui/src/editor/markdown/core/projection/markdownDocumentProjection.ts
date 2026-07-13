import { syntaxTree } from "@codemirror/language";
import {
  EditorState,
  StateEffect,
  StateField,
  type ChangeDesc,
  type Range,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from "@codemirror/view";
import {
  markdownAssetUrlResolverFacet,
  markdownDocumentPathFacet,
  markdownHtmlTrustModeFacet,
  markdownLinkGraphFacet,
} from "../editor/markdownLivePreviewContext";
import { addMarkdownBlockAndLineDecorations } from "../decorations/blockDecorations";
import type {
  InlineRevealRange,
  MarkdownDecorationBuilders,
} from "../decorations/decorationPrimitives";
import {
  getComposingBlockLineKey,
  getInputCompositionState,
  markdownComposingBlockLineField,
} from "../state/composingBlockLine";
import { markdownExpandedImageField } from "../state/expandedImage";
import { getLivePreviewFocusState } from "../state/livePreviewFocus";
import { getInlineRevealElement } from "../syntax/markdownElements";
import { getMarkdownPlansInRange } from "../plans/markdownPlanIndex";
import { getDocRevision } from "../../platform/brokers/transactionBroker";

type ProjectionRangeReason = "benchmark";

export type MarkdownProjectionRangeRequest = {
  from: number;
  to: number;
  revision: string;
  reason: ProjectionRangeReason;
};

type MarkdownDocumentProjection = {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
  focused: boolean;
  inputComposing: boolean;
  composingLineKey: string;
  revealRange: InlineRevealRange | null;
  expandedImageRange: InlineRevealRange | null;
  blockRanges: readonly InlineRevealRange[];
};

const markdownProjectionRangeEffect = StateEffect.define<MarkdownProjectionRangeRequest>();
const projectionDiagnostics = {
  mappedTransactions: 0,
  changedRangePatches: 0,
  focusRevealPatches: 0,
  explicitRangePatches: 0,
  globalInvalidations: 0,
};

/**
 * Document-scoped projection of canonical Markdown source.
 *
 * This field directly owns every decoration that can change line wrapping or
 * vertical geometry. CodeMirror must know those ranges before it computes a
 * viewport; adding/removing them in response to scrolling creates a feedback
 * loop between the height map, scroll anchoring, and viewport calculation.
 *
 * The complete projection is built once. Existing ranges are then mapped
 * through ChangeSet and only changed blocks plus old/new reveal ranges are
 * rebuilt, so ordinary input transactions remain incremental.
 */
export const markdownLivePreviewDecorations = StateField.define<MarkdownDocumentProjection>({
  create(state) {
    return createInitialProjection(state);
  },
  update(previous, transaction) {
    const focused = getLivePreviewFocusState(previous.focused, transaction.effects);
    const inputComposing = getInputCompositionState(previous.inputComposing, transaction.effects);
    const composingLine = transaction.state.field(markdownComposingBlockLineField, false) ?? null;
    const expandedImageRange = transaction.state.field(markdownExpandedImageField, false) ?? null;
    const revealRange = getLivePreviewInlineRevealRange(transaction.state, focused);
    const contextInvalidation = getDecorationContextInvalidation(transaction);

    let decorations = previous.decorations.map(transaction.changes);
    let atomicRanges = previous.atomicRanges.map(transaction.changes);
    let blockRanges = transaction.docChanged
      ? previous.blockRanges.map((range) => mapRange(range, transaction.changes))
      : previous.blockRanges;
    const patchRanges: InlineRevealRange[] = [];

    if (contextInvalidation === "global") {
      decorations = Decoration.none;
      atomicRanges = Decoration.none;
      projectionDiagnostics.globalInvalidations += 1;
      patchRanges.push(getDocumentProjectionRange(transaction.state));
    } else {
      if (transaction.docChanged) {
        const changedRanges = getChangedProjectionRanges(transaction);
        patchRanges.push(...changedRanges);
        for (const blockRange of blockRanges) {
          if (changedRanges.some((range) => rangesOverlapOrTouch(blockRange, range))) {
            patchRanges.push(blockRange);
          }
        }
        projectionDiagnostics.mappedTransactions += 1;
        projectionDiagnostics.changedRangePatches += changedRanges.length;
      }

      const previousRevealRange = mapOptionalRange(previous.revealRange, transaction.changes);
      const previousExpandedImageRange = mapOptionalRange(previous.expandedImageRange, transaction.changes);
      addRangeIfChanged(patchRanges, previousRevealRange, revealRange);
      addRangeIfChanged(patchRanges, previousExpandedImageRange, expandedImageRange);
      addKeyedLineRange(
        patchRanges,
        transaction.state,
        previous.composingLineKey,
        getComposingBlockLineKey(transaction.state),
      );
      if (
        !transaction.docChanged
        && (
          focused !== previous.focused
          || inputComposing !== previous.inputComposing
          || !sameRange(previousRevealRange, revealRange)
        )
      ) {
        projectionDiagnostics.focusRevealPatches += patchRanges.length;
      }

      if (
        syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
        && !transaction.docChanged
      ) {
        // Background parsing may finish after initial paint. Reconcile the
        // complete direct set so newly parsed offscreen structures already
        // exist in the height map before the user scrolls to them.
        patchRanges.push(getDocumentProjectionRange(transaction.state));
      }
    }

    for (const effect of transaction.effects) {
      if (!effect.is(markdownProjectionRangeEffect)) continue;
      if (effect.value.revision !== getDocRevision(transaction.state.doc)) continue;
      const range = normalizeProjectionRange(transaction.state, effect.value.from, effect.value.to);
      patchRanges.push(range);
      projectionDiagnostics.explicitRangePatches += 1;
    }

    const mergedRanges = mergeProjectionRanges(
      patchRanges.map((range) => expandToStableProjectionRange(transaction.state, range.from, range.to)),
    );
    for (const range of mergedRanges) {
      const builders = buildProjectionRange(transaction.state, range, revealRange, expandedImageRange, composingLine);
      decorations = replaceDecorationRange(decorations, range, builders.decorations);
      atomicRanges = replaceDecorationRange(atomicRanges, range, builders.atomicRanges);
    }
    if (mergedRanges.length > 0) {
      blockRanges = replaceBlockRanges(transaction.state, blockRanges, mergedRanges);
    }

    return {
      decorations,
      atomicRanges,
      focused,
      inputComposing,
      composingLineKey: composingLine ? `${composingLine.from}:${composingLine.to}` : "",
      revealRange,
      expandedImageRange,
      blockRanges,
    };
  },
  provide(field) {
    return [
      EditorView.decorations.from(field, (value) => value.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(field).atomicRanges),
    ];
  },
});

export function requestMarkdownProjectionRange(
  state: EditorState,
  from: number,
  to: number,
  reason: ProjectionRangeReason = "benchmark",
) {
  return markdownProjectionRangeEffect.of({
    from,
    to,
    revision: getDocRevision(state.doc),
    reason,
  });
}

export function resetMarkdownProjectionDiagnostics() {
  projectionDiagnostics.mappedTransactions = 0;
  projectionDiagnostics.changedRangePatches = 0;
  projectionDiagnostics.focusRevealPatches = 0;
  projectionDiagnostics.explicitRangePatches = 0;
  projectionDiagnostics.globalInvalidations = 0;
}

export function getMarkdownProjectionDiagnostics() {
  return { ...projectionDiagnostics };
}

function createInitialProjection(state: EditorState): MarkdownDocumentProjection {
  const initialRange = getDocumentProjectionRange(state);
  const expandedImageRange = state.field(markdownExpandedImageField, false) ?? null;
  const composingLine = state.field(markdownComposingBlockLineField, false) ?? null;
  const builders = buildProjectionRange(state, initialRange, null, expandedImageRange, composingLine);
  return {
    decorations: builders.decorations.length > 0
      ? Decoration.set(builders.decorations, true)
      : Decoration.none,
    atomicRanges: builders.atomicRanges.length > 0
      ? Decoration.set(builders.atomicRanges, true)
      : Decoration.none,
    focused: false,
    inputComposing: false,
    composingLineKey: getComposingBlockLineKey(state),
    revealRange: null,
    expandedImageRange,
    blockRanges: getBlockAtomRanges(state, initialRange),
  };
}

function getDocumentProjectionRange(state: EditorState): InlineRevealRange {
  return { from: 0, to: state.doc.length };
}

function buildProjectionRange(
  state: EditorState,
  range: InlineRevealRange,
  revealRange: InlineRevealRange | null,
  expandedImageRange: InlineRevealRange | null,
  composingLine: InlineRevealRange | null,
): MarkdownDecorationBuilders {
  const builders: MarkdownDecorationBuilders = { decorations: [], atomicRanges: [] };
  addMarkdownBlockAndLineDecorations(
    state,
    builders,
    revealRange,
    expandedImageRange,
    composingLine,
    state.facet(markdownHtmlTrustModeFacet),
    state.facet(markdownLinkGraphFacet),
    state.facet(markdownDocumentPathFacet),
    state.facet(markdownAssetUrlResolverFacet),
    range.from,
    range.to,
  );
  return builders;
}

function replaceDecorationRange(
  current: DecorationSet,
  range: InlineRevealRange,
  additions: readonly Range<Decoration>[],
): DecorationSet {
  return current.update({
    filterFrom: range.from,
    filterTo: range.to,
    filter: (from, to) => to < range.from || from > range.to,
    add: additions,
    sort: true,
  });
}

function getChangedProjectionRanges(transaction: Transaction): InlineRevealRange[] {
  const ranges: InlineRevealRange[] = [];
  transaction.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    ranges.push(normalizeProjectionRange(transaction.state, fromB, Math.max(fromB, toB)));
  });
  return ranges;
}

function expandToStableProjectionRange(
  state: EditorState,
  from: number,
  to: number,
): InlineRevealRange {
  let range = addLineOverscan(state, from, to, 1);
  for (let pass = 0; pass < 2; pass += 1) {
    let expanded = false;
    for (const { plan } of getMarkdownPlansInRange(state, range.from, range.to)) {
      if (plan.presentation !== "blockAtom") continue;
      if (plan.sourceRange.from < range.from) {
        range = { ...range, from: state.doc.lineAt(plan.sourceRange.from).from };
        expanded = true;
      }
      if (plan.sourceRange.to > range.to) {
        range = { ...range, to: state.doc.lineAt(plan.sourceRange.to).to };
        expanded = true;
      }
    }
    if (!expanded) break;
  }
  return range;
}

function normalizeProjectionRange(state: EditorState, from: number, to: number): InlineRevealRange {
  const rangeFrom = Math.max(0, Math.min(from, to, state.doc.length));
  const rangeTo = Math.max(rangeFrom, Math.min(Math.max(from, to), state.doc.length));
  return {
    from: state.doc.lineAt(rangeFrom).from,
    to: state.doc.lineAt(rangeTo).to,
  };
}

function addLineOverscan(
  state: EditorState,
  from: number,
  to: number,
  lineCount: number,
): InlineRevealRange {
  const normalized = normalizeProjectionRange(state, from, to);
  const firstLineNumber = Math.max(1, state.doc.lineAt(normalized.from).number - lineCount);
  const lastLineNumber = Math.min(state.doc.lines, state.doc.lineAt(normalized.to).number + lineCount);
  return {
    from: state.doc.line(firstLineNumber).from,
    to: state.doc.line(lastLineNumber).to,
  };
}

function mapOptionalRange(
  range: InlineRevealRange | null,
  changes: ChangeDesc,
): InlineRevealRange | null {
  if (!range) return null;
  return {
    from: changes.mapPos(range.from, -1),
    to: changes.mapPos(range.to, 1),
  };
}

function mapRange(range: InlineRevealRange, changes: ChangeDesc): InlineRevealRange {
  return {
    from: changes.mapPos(range.from, -1),
    to: changes.mapPos(range.to, 1),
  };
}

function replaceBlockRanges(
  state: EditorState,
  current: readonly InlineRevealRange[],
  replacedRanges: readonly InlineRevealRange[],
): readonly InlineRevealRange[] {
  const next = current.filter((blockRange) => (
    !replacedRanges.some((range) => rangesOverlapOrTouch(blockRange, range))
  ));
  for (const range of replacedRanges) next.push(...getBlockAtomRanges(state, range));
  return dedupeProjectionRanges(next);
}

function getBlockAtomRanges(
  state: EditorState,
  range: InlineRevealRange,
): InlineRevealRange[] {
  const ranges: InlineRevealRange[] = [];
  for (const { plan } of getMarkdownPlansInRange(state, range.from, range.to)) {
    if (plan.presentation !== "blockAtom") continue;
    ranges.push({ from: plan.sourceRange.from, to: plan.sourceRange.to });
  }
  return ranges;
}

function rangesOverlapOrTouch(left: InlineRevealRange, right: InlineRevealRange): boolean {
  return left.from <= right.to && right.from <= left.to;
}

function dedupeProjectionRanges(ranges: readonly InlineRevealRange[]): InlineRevealRange[] {
  const seen = new Set<string>();
  return ranges
    .filter((range) => {
      const key = `${range.from}:${range.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

function addRangeIfChanged(
  ranges: InlineRevealRange[],
  previous: InlineRevealRange | null,
  next: InlineRevealRange | null,
) {
  if (sameRange(previous, next)) return;
  if (previous) ranges.push(previous);
  if (next) ranges.push(next);
}

function addKeyedLineRange(
  ranges: InlineRevealRange[],
  state: EditorState,
  previousKey: string,
  nextKey: string,
) {
  if (previousKey === nextKey) return;
  for (const key of [previousKey, nextKey]) {
    const from = Number.parseInt(key.split(":")[0] ?? "", 10);
    if (Number.isFinite(from) && from >= 0 && from <= state.doc.length) {
      const line = state.doc.lineAt(from);
      ranges.push({ from: line.from, to: line.to });
    }
  }
}

function sameRange(left: InlineRevealRange | null, right: InlineRevealRange | null): boolean {
  return left?.from === right?.from && left?.to === right?.to;
}

function mergeProjectionRanges(ranges: readonly InlineRevealRange[]): InlineRevealRange[] {
  const sorted = ranges
    .filter((range) => range.to >= range.from)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: InlineRevealRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.from > previous.to + 1) {
      merged.push({ ...range });
    } else {
      previous.to = Math.max(previous.to, range.to);
    }
  }
  return merged;
}

function getLivePreviewInlineRevealRange(
  state: EditorState,
  focused: boolean,
): InlineRevealRange | null {
  if (!focused || state.readOnly || state.selection.ranges.length !== 1) return null;
  const selection = state.selection.main;
  if (!selection.empty) return null;
  const element = getInlineRevealElement(state, selection.from);
  return element ? { from: element.from, to: element.to } : null;
}

function getDecorationContextInvalidation(
  transaction: Transaction,
): "none" | "global" {
  if (!transaction.reconfigured) return "none";
  if (
    transaction.startState.facet(markdownHtmlTrustModeFacet) !== transaction.state.facet(markdownHtmlTrustModeFacet)
    || transaction.startState.facet(markdownDocumentPathFacet) !== transaction.state.facet(markdownDocumentPathFacet)
    || transaction.startState.facet(markdownAssetUrlResolverFacet) !== transaction.state.facet(markdownAssetUrlResolverFacet)
  ) {
    return "global";
  }
  if (transaction.startState.facet(markdownLinkGraphFacet) !== transaction.state.facet(markdownLinkGraphFacet)) return "global";
  return "none";
}
