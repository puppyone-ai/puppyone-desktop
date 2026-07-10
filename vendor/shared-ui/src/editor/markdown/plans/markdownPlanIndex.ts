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

  const plans = getMarkdownElements(state).map((element) => ({
    element,
    plan: compileMarkdownElementPlan(element),
  }));
  markdownPlanIndexCache.set(state.doc, { tree, plans });
  return plans;
}

export function getMarkdownPlansInRange(
  state: EditorState,
  from: number,
  to: number,
): readonly IndexedMarkdownPlan[] {
  const rangeFrom = Math.max(0, Math.min(from, to, state.doc.length));
  const rangeTo = Math.max(rangeFrom, Math.min(Math.max(from, to), state.doc.length));
  return getMarkdownPlanIndex(state).filter(({ plan }) => (
    plan.sourceRange.from < rangeTo && plan.sourceRange.to > rangeFrom
  ));
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
