import { StateField, type EditorState, type Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { getMarkdownElements, getMarkdownElementsInRange, type MarkdownElement } from "../syntax/markdownElements";
import { compileMarkdownElementPlan } from "./markdownPlanCompiler";
import type { MarkdownElementPlan, SourceRange } from "./markdownPlanTypes";

export type IndexedMarkdownPlan = {
  element: MarkdownElement;
  plan: MarkdownElementPlan;
};

type MarkdownPlanIndexCacheEntry = {
  tree: ReturnType<typeof syntaxTree>;
  plans: readonly IndexedMarkdownPlan[];
  intervals: MarkdownPlanIntervalNode | null;
};

type MarkdownPlanIndexState = MarkdownPlanIndexCacheEntry;

type MarkdownPlanIntervalNode = {
  entry: IndexedMarkdownPlan;
  maxTo: number;
  left: MarkdownPlanIntervalNode | null;
  right: MarkdownPlanIntervalNode | null;
};

const markdownPlanIndexCache = new WeakMap<object, MarkdownPlanIndexCacheEntry>();

/**
 * Keep semantic plans in the EditorState so ordinary character edits can map
 * unaffected plans and only re-collect the changed source line. The WeakMap is
 * retained as a fallback for consumers outside a Live Preview EditorState.
 */
export const markdownPlanIndexField = StateField.define<MarkdownPlanIndexState>({
  create(state) {
    return buildMarkdownPlanIndex(state);
  },
  update(previous, transaction) {
    if (!transaction.docChanged) return previous;
    if (!canIncrementallyUpdateMarkdownPlans(transaction)) return buildMarkdownPlanIndex(transaction.state);

    const oldRanges = getMarkdownChangedLineRanges(transaction, "old");
    const newRanges = getMarkdownChangedLineRanges(transaction, "new");
    const retained = previous.plans
      .filter(({ element }) => !oldRanges.some((range) => rangesOverlap(element.from, element.to, range.from, range.to)))
      .map(({ element }) => ({
        element: mapMarkdownElement(element, transaction),
        plan: null,
      }));
    const replacement = newRanges.flatMap((range) => getMarkdownElementsInRange(transaction.state, range.from, range.to))
      .map((element) => ({ element, plan: null }));
    const plans = [...retained, ...replacement]
      .map(({ element }) => ({ element, plan: compileMarkdownElementPlan(element) }))
      .sort((left, right) => (
        left.plan.sourceRange.from - right.plan.sourceRange.from ||
        left.plan.sourceRange.to - right.plan.sourceRange.to
      ));
    return {
      tree: syntaxTree(transaction.state),
      plans,
      intervals: buildIntervalIndex(plans, 0, plans.length),
    };
  },
});

/**
 * Range-indexed compiled render plans for the current document + syntax tree.
 * Consumers (decorations, keymaps, reveal) must read capabilities from plans
 * rather than re-inferring them from element kinds.
 */
export function getMarkdownPlanIndex(state: EditorState): readonly IndexedMarkdownPlan[] {
  const stateIndex = state.field(markdownPlanIndexField, false);
  if (stateIndex) return stateIndex.plans;
  const tree = syntaxTree(state);
  const cached = markdownPlanIndexCache.get(state.doc);
  if (cached?.tree === tree) return cached.plans;

  const plans = getMarkdownElements(state)
    .map((element) => ({
      element,
      plan: compileMarkdownElementPlan(element),
    }))
    .sort((left, right) => (
      left.plan.sourceRange.from - right.plan.sourceRange.from ||
      left.plan.sourceRange.to - right.plan.sourceRange.to
    ));
  markdownPlanIndexCache.set(state.doc, { tree, plans, intervals: buildIntervalIndex(plans, 0, plans.length) });
  return plans;
}

export function getMarkdownPlansInRange(
  state: EditorState,
  from: number,
  to: number,
): readonly IndexedMarkdownPlan[] {
  const rangeFrom = Math.max(0, Math.min(from, to, state.doc.length));
  const rangeTo = Math.max(rangeFrom, Math.min(Math.max(from, to), state.doc.length));
  const result: IndexedMarkdownPlan[] = [];
  const stateIndex = state.field(markdownPlanIndexField, false);
  if (stateIndex) {
    queryIntervalIndex(stateIndex.intervals, rangeFrom, rangeTo, result);
  } else {
    getMarkdownPlanIndex(state);
    const cached = markdownPlanIndexCache.get(state.doc);
    queryIntervalIndex(cached?.intervals ?? null, rangeFrom, rangeTo, result);
  }
  return result;
}

export type MarkdownChangedLineRange = { from: number; to: number };

export function getMarkdownChangedLineRanges(
  transaction: Transaction,
  side: "old" | "new" = "new",
): readonly MarkdownChangedLineRange[] {
  const document = side === "old" ? transaction.startState.doc : transaction.state.doc;
  const ranges: MarkdownChangedLineRange[] = [];
  transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const from = side === "old" ? fromA : fromB;
    const to = side === "old" ? toA : toB;
    const start = document.lineAt(Math.min(from, document.length));
    const end = document.lineAt(Math.min(Math.max(from, to - 1), document.length));
    ranges.push({ from: start.from, to: end.to });
  });
  return mergeMarkdownRanges(ranges);
}

export function canIncrementallyUpdateMarkdownPlans(transaction: Transaction): boolean {
  if (!transaction.docChanged || transaction.reconfigured) return false;
  const oldRanges = getMarkdownChangedLineRanges(transaction, "old");
  const newRanges = getMarkdownChangedLineRanges(transaction, "new");
  return ![...oldRanges.map((range) => transaction.startState.sliceDoc(range.from, range.to)),
    ...newRanges.map((range) => transaction.state.sliceDoc(range.from, range.to))]
    .some(isStructuralMarkdownSource)
    && !oldRanges.some((range) => rangeTouchesStructuralSyntax(transaction.startState, range))
    && !newRanges.some((range) => rangeTouchesStructuralSyntax(transaction.state, range));
}

function buildMarkdownPlanIndex(state: EditorState): MarkdownPlanIndexCacheEntry {
  const tree = syntaxTree(state);
  const plans = getMarkdownElements(state)
    .map((element) => ({ element, plan: compileMarkdownElementPlan(element) }))
    .sort((left, right) => (
      left.plan.sourceRange.from - right.plan.sourceRange.from ||
      left.plan.sourceRange.to - right.plan.sourceRange.to
    ));
  return { tree, plans, intervals: buildIntervalIndex(plans, 0, plans.length) };
}

function mapMarkdownElement(element: MarkdownElement, transaction: Transaction): MarkdownElement {
  const mapRange = (range: { from: number; to: number }) => ({
    from: transaction.changes.mapPos(range.from, -1),
    to: transaction.changes.mapPos(range.to, 1),
  });
  const mapped = {
    ...element,
    ...mapRange(element),
    markerRanges: element.markerRanges.map(mapRange),
    contentRange: element.contentRange ? mapRange(element.contentRange) : undefined,
    lineFrom: element.lineFrom === undefined ? undefined : transaction.changes.mapPos(element.lineFrom, -1),
    lineTo: element.lineTo === undefined ? undefined : transaction.changes.mapPos(element.lineTo, 1),
  } as MarkdownElement;
  if (mapped.kind !== "inlineHtml" || !mapped.inlineHtml) return mapped;

  return {
    ...mapped,
    inlineHtml: {
      ...mapped.inlineHtml,
      ...mapRange(mapped.inlineHtml),
      openingMarker: mapRange(mapped.inlineHtml.openingMarker),
      contentRange: mapped.inlineHtml.contentRange ? mapRange(mapped.inlineHtml.contentRange) : null,
      closingMarker: mapped.inlineHtml.closingMarker ? mapRange(mapped.inlineHtml.closingMarker) : null,
      containerFrom: transaction.changes.mapPos(mapped.inlineHtml.containerFrom, -1),
      containerTo: transaction.changes.mapPos(mapped.inlineHtml.containerTo, 1),
    },
  };
}

function mergeMarkdownRanges(ranges: readonly MarkdownChangedLineRange[]): MarkdownChangedLineRange[] {
  return [...ranges]
    .sort((left, right) => left.from - right.from || left.to - right.to)
    .reduce<MarkdownChangedLineRange[]>((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.from <= previous.to + 1) {
        previous.to = Math.max(previous.to, range.to);
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);
}

function rangesOverlap(from: number, to: number, otherFrom: number, otherTo: number): boolean {
  return from <= otherTo && to >= otherFrom;
}

function isStructuralMarkdownSource(source: string): boolean {
  return /(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|\|.*\||`{3,}|~{3,}|<\/?[A-Za-z]|[-*_]{3,}\s*$)/m.test(source);
}

const STRUCTURAL_MARKDOWN_SYNTAX_NODES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "Blockquote",
  "FencedCode",
  "HTMLBlock",
  "ListItem",
  "Table",
]);

function rangeTouchesStructuralSyntax(state: EditorState, range: MarkdownChangedLineRange): boolean {
  for (const position of [range.from, Math.max(range.from, range.to - 1)]) {
    for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, -1); node; node = node.parent) {
      if (STRUCTURAL_MARKDOWN_SYNTAX_NODES.has(node.name)) return true;
    }
  }
  return false;
}

function buildIntervalIndex(
  entries: readonly IndexedMarkdownPlan[],
  from: number,
  to: number,
): MarkdownPlanIntervalNode | null {
  if (from >= to) return null;
  const middle = (from + to) >>> 1;
  const entry = entries[middle];
  if (!entry) return null;
  const left = buildIntervalIndex(entries, from, middle);
  const right = buildIntervalIndex(entries, middle + 1, to);
  return {
    entry,
    maxTo: Math.max(entry.plan.sourceRange.to, left?.maxTo ?? Number.NEGATIVE_INFINITY, right?.maxTo ?? Number.NEGATIVE_INFINITY),
    left,
    right,
  };
}

function queryIntervalIndex(
  node: MarkdownPlanIntervalNode | null,
  from: number,
  to: number,
  result: IndexedMarkdownPlan[],
) {
  if (!node || node.maxTo <= from) return;
  queryIntervalIndex(node.left, from, to, result);
  const range = node.entry.plan.sourceRange;
  if (range.from < to && range.to > from) result.push(node.entry);
  // Entries in the right subtree start at or after this entry, so none can
  // overlap once this source range begins at/after the query end.
  if (range.from < to) queryIntervalIndex(node.right, from, to, result);
}

export function findMarkdownPlanAt(
  state: EditorState,
  caret: number,
  predicate: (entry: IndexedMarkdownPlan) => boolean,
): IndexedMarkdownPlan | null {
  const line = state.doc.lineAt(caret);
  let best: IndexedMarkdownPlan | null = null;
  for (const entry of getMarkdownPlansInRange(state, line.from, line.to)) {
    if (!predicate(entry)) continue;
    const { from, to } = entry.plan.sourceRange;
    if (caret < from || caret > to) continue;
    if (!best || (to - from) < (best.plan.sourceRange.to - best.plan.sourceRange.from)) {
      best = entry;
    }
  }
  return best;
}

export function getCollapsedMarkerDeletionUnit(
  state: EditorState,
  caret: number,
  direction: "backward" | "forward",
): SourceRange | null {
  const line = state.doc.lineAt(caret);
  for (const { plan } of getMarkdownPlansInRange(state, line.from, line.to)) {
    if (plan.capabilities.deleteUnits.length === 0) continue;
    if (plan.presentation === "visibleSource") continue;

    if (direction === "backward" && caret === plan.sourceRange.to) {
      return plan.capabilities.deleteUnits[plan.capabilities.deleteUnits.length - 1] ?? null;
    }
    if (direction === "forward" && caret === plan.sourceRange.from) {
      return plan.capabilities.deleteUnits[0] ?? null;
    }
  }
  return null;
}

export function getExpandableInlineAtomAtSelection(
  state: EditorState,
  from: number,
  to: number,
): IndexedMarkdownPlan | null {
  if (from === to) return null;
  for (const entry of getMarkdownPlansInRange(state, from, to)) {
    const { plan } = entry;
    if (plan.presentation !== "inlineAtom") continue;
    if (!plan.capabilities.expand) continue;
    if (plan.sourceRange.from === from && plan.sourceRange.to === to) return entry;
  }
  return null;
}
