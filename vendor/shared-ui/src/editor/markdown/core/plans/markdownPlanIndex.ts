import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { getMarkdownElements, type MarkdownElement } from "../syntax/markdownElements";
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

type MarkdownPlanIntervalNode = {
  entry: IndexedMarkdownPlan;
  maxTo: number;
  left: MarkdownPlanIntervalNode | null;
  right: MarkdownPlanIntervalNode | null;
};

const markdownPlanIndexCache = new WeakMap<object, MarkdownPlanIndexCacheEntry>();

/**
 * Range-indexed compiled render plans for the current document + syntax tree.
 * Consumers (decorations, keymaps, reveal) must read capabilities from plans
 * rather than re-inferring them from element kinds.
 */
export function getMarkdownPlanIndex(state: EditorState): readonly IndexedMarkdownPlan[] {
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
  getMarkdownPlanIndex(state);
  const cached = markdownPlanIndexCache.get(state.doc);
  queryIntervalIndex(cached?.intervals ?? null, rangeFrom, rangeTo, result);
  return result;
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
