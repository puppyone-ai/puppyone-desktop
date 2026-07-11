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
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
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
import { getRendererPerformanceTracker } from "../../../../performance/rendererPerformance";

type ProjectionRangeReason = "viewport" | "benchmark";

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
  viewportRange: InlineRevealRange | null;
};

const VIEWPORT_OVERSCAN_LINES = 16;
const INITIAL_PROJECTION_LINES = 48;
const rendererPerformance = getRendererPerformanceTracker();
const markdownProjectionRangeEffect = StateEffect.define<MarkdownProjectionRangeRequest>();
const projectionDiagnostics = {
  mappedTransactions: 0,
  changedRangePatches: 0,
  focusRevealPatches: 0,
  viewportPatches: 0,
  globalInvalidations: 0,
};

/**
 * View-scoped, disposable projection of canonical Markdown source. Existing
 * decorations are mapped through ChangeSet; only changed blocks, old/new
 * reveal ranges and explicitly scheduled viewport/deferred partitions are
 * rebuilt. No ordinary input transaction walks the complete document.
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
    let viewportRange = mapOptionalRange(previous.viewportRange, transaction.changes);
    const patchRanges: InlineRevealRange[] = [];

    if (contextInvalidation === "global") {
      decorations = Decoration.none;
      atomicRanges = Decoration.none;
      projectionDiagnostics.globalInvalidations += 1;
      if (viewportRange) patchRanges.push(viewportRange);
    } else {
      if (contextInvalidation === "viewport" && viewportRange) patchRanges.push(viewportRange);
      if (transaction.docChanged) {
        patchRanges.push(...getChangedProjectionRanges(transaction));
        projectionDiagnostics.mappedTransactions += 1;
        projectionDiagnostics.changedRangePatches += patchRanges.length;
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
        && viewportRange
      ) {
        patchRanges.push(viewportRange);
      }
    }

    for (const effect of transaction.effects) {
      if (!effect.is(markdownProjectionRangeEffect)) continue;
      if (effect.value.revision !== getDocRevision(transaction.state.doc)) continue;
      const range = normalizeProjectionRange(transaction.state, effect.value.from, effect.value.to);
      patchRanges.push(range);
      if (effect.value.reason === "viewport") {
        viewportRange = range;
        projectionDiagnostics.viewportPatches += 1;
      }
    }

    const mergedRanges = mergeProjectionRanges(
      patchRanges.map((range) => expandToStableProjectionRange(transaction.state, range.from, range.to)),
    );
    for (const range of mergedRanges) {
      const builders = buildProjectionRange(transaction.state, range, revealRange, expandedImageRange, composingLine);
      decorations = replaceDecorationRange(decorations, range, builders.decorations);
      atomicRanges = replaceDecorationRange(atomicRanges, range, builders.atomicRanges);
    }

    return {
      decorations,
      atomicRanges,
      focused,
      inputComposing,
      composingLineKey: composingLine ? `${composingLine.from}:${composingLine.to}` : "",
      revealRange,
      expandedImageRange,
      viewportRange,
    };
  },
  provide(field) {
    return [
      EditorView.decorations.from(field, (value) => value.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(field).atomicRanges),
    ];
  },
});

/**
 * Schedules only visible work. Non-visible CodeMirror content has no DOM and
 * therefore needs no decoration projection; scrolling invalidates the old
 * request and builds the newly visible partition under the current revision.
 */
export const markdownProjectionSchedulerExtension = ViewPlugin.fromClass(class {
  private readonly view: EditorView;
  private animationFrame: number | null = null;
  private generation = 0;
  private destroyed = false;

  constructor(view: EditorView) {
    this.view = view;
    this.scheduleViewportProjection();
  }

  update(update: ViewUpdate) {
    if (
      update.viewportChanged
      || update.docChanged
      || update.transactions.some((transaction) => (
        getDecorationContextInvalidation(transaction) !== "none"
      ))
    ) {
      this.scheduleViewportProjection();
    }
  }

  destroy() {
    this.destroyed = true;
    this.generation += 1;
    if (this.animationFrame !== null) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  private scheduleViewportProjection() {
    if (this.animationFrame !== null || this.destroyed) return;
    const generation = ++this.generation;
    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = null;
      if (this.destroyed || generation !== this.generation) return;
      const ranges = this.view.visibleRanges;
      if (ranges.length === 0) return;
      const from = ranges[0]?.from ?? 0;
      const to = ranges[ranges.length - 1]?.to ?? from;
      const overscanned = addLineOverscan(this.view.state, from, to, VIEWPORT_OVERSCAN_LINES);
      this.dispatchRange(overscanned, "viewport");
    });
  }

  private dispatchRange(range: InlineRevealRange, reason: ProjectionRangeReason) {
    if (this.destroyed) return;
    const revision = getDocRevision(this.view.state.doc);
    const startedAt = performance.now();
    this.view.dispatch({
      effects: markdownProjectionRangeEffect.of({ ...range, revision, reason }),
    });
    rendererPerformance.recordOperation(
      `markdown_projection_${reason}`,
      performance.now() - startedAt,
    );
  }

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
  projectionDiagnostics.viewportPatches = 0;
  projectionDiagnostics.globalInvalidations = 0;
}

export function getMarkdownProjectionDiagnostics() {
  return { ...projectionDiagnostics };
}

function createInitialProjection(state: EditorState): MarkdownDocumentProjection {
  const lastLine = state.doc.line(Math.min(state.doc.lines, INITIAL_PROJECTION_LINES));
  const initialRange = expandToStableProjectionRange(state, 0, lastLine.to);
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
    viewportRange: initialRange,
  };
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
): "none" | "viewport" | "global" {
  if (!transaction.reconfigured) return "none";
  if (
    transaction.startState.facet(markdownHtmlTrustModeFacet) !== transaction.state.facet(markdownHtmlTrustModeFacet)
    || transaction.startState.facet(markdownDocumentPathFacet) !== transaction.state.facet(markdownDocumentPathFacet)
    || transaction.startState.facet(markdownAssetUrlResolverFacet) !== transaction.state.facet(markdownAssetUrlResolverFacet)
  ) {
    return "global";
  }
  if (transaction.startState.facet(markdownLinkGraphFacet) !== transaction.state.facet(markdownLinkGraphFacet)) {
    return "viewport";
  }
  return "none";
}
