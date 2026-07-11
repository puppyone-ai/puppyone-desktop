import type { EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../../../viewerTypes";
import { createMarkdownBlockFeatureWidget } from "../../features/blockFeatureRegistry";
import { getMarkdownPlansInRange, type IndexedMarkdownPlan } from "../plans/markdownPlanIndex";
import type { MarkdownElementPlan } from "../plans/markdownPlanTypes";
import { isMarkdownTableSourceLine } from "../../features/table/tableModel";
import { getMarkdownTaskLine, type MarkdownTaskLine } from "../rendering/taskModel";
import type { ComposingBlockLine } from "../state/composingBlockLine";
import type { ExpandedImageRange } from "../state/expandedImage";
import { TaskCheckboxWidget } from "../widgets/inlineWidgets";
import {
  addReplacementDecoration,
  addSourceSyntaxDecoration,
  type InlineRevealRange,
  type MarkdownDecorationBuilders,
} from "./decorationPrimitives";
import { addInlineMarkdownDecorations } from "./inlineDecorations";

type TaskCheckboxPlan = Extract<MarkdownElementPlan, { presentation: "inlineAtom" }> & {
  atom: { kind: "taskCheckbox"; checked: boolean };
};

const markdownDecorationDiagnostics = {
  rangeBuilds: 0,
  linesScanned: 0,
  fullDocumentScans: 0,
};

export function addMarkdownBlockAndLineDecorations(
  state: EditorState,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  expandedImageRange: ExpandedImageRange | null,
  composingLine: ComposingBlockLine | null,
  htmlTrustMode: MarkdownHtmlTrustMode,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  from = 0,
  to = state.doc.length,
) {
  const rangeFrom = Math.max(0, Math.min(from, to, state.doc.length));
  const rangeTo = Math.max(rangeFrom, Math.min(Math.max(from, to), state.doc.length));
  const firstLine = state.doc.lineAt(rangeFrom);
  const lastLine = state.doc.lineAt(rangeTo);
  const plans = getMarkdownPlansInRange(state, firstLine.from, lastLine.to);
  markdownDecorationDiagnostics.rangeBuilds += 1;
  markdownDecorationDiagnostics.linesScanned += lastLine.number - firstLine.number + 1;
  if (firstLine.from === 0 && lastLine.to === state.doc.length) {
    markdownDecorationDiagnostics.fullDocumentScans += 1;
  }

  for (let lineNumber = firstLine.number; lineNumber <= lastLine.number;) {
    const line = state.doc.line(lineNumber);
    if (composingLine?.from === line.from) {
      builders.decorations.push(
        Decoration.line({
          class: "cm-md-source-line",
        }).range(line.from),
      );
      lineNumber += 1;
      continue;
    }

    const blockPlan = findBlockAtomPlanAtLineStart(plans, line.from);
    if (blockPlan) {
      const widget = createMarkdownBlockFeatureWidget(blockPlan, {
        htmlTrustMode,
        markdownLinkGraph,
        documentPath,
        markdownAssetUrlResolver,
      });
      addReplacementDecoration(
        builders,
        Decoration.replace({
          widget,
          block: true,
        }),
        blockPlan.sourceRange.from,
        blockPlan.sourceRange.to,
      );
      const lastCovered = Math.min(
        Math.max(blockPlan.sourceRange.to - 1, blockPlan.sourceRange.from),
        state.doc.length,
      );
      lineNumber = state.doc.lineAt(lastCovered).number + 1;
      continue;
    }

    decorateMarkdownLine(
      state,
      line.from,
      line.to,
      line.text,
      builders,
      inlineRevealRange,
      expandedImageRange,
      markdownLinkGraph,
      documentPath,
      markdownAssetUrlResolver,
      plans,
    );
    lineNumber += 1;
  }
}

function findBlockAtomPlanAtLineStart(
  plans: readonly IndexedMarkdownPlan[],
  lineFrom: number,
): Extract<MarkdownElementPlan, { presentation: "blockAtom" }> | null {
  for (const { plan } of plans) {
    if (plan.presentation !== "blockAtom") continue;
    if (plan.sourceRange.from !== lineFrom) continue;
    return plan;
  }
  return null;
}

function decorateMarkdownLine(
  state: EditorState,
  lineFrom: number,
  lineTo: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  expandedImageRange: ExpandedImageRange | null,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  plans: readonly IndexedMarkdownPlan[],
) {
  const taskPlan = findTaskCheckboxPlan(plans, lineFrom, lineTo);
  const parsedTaskLine = taskPlan ? getMarkdownTaskLine({ from: lineFrom, to: lineTo, text }) : null;
  const taskLine = parsedTaskLine
    ? { ...parsedTaskLine, checked: taskPlan?.atom.checked ?? parsedTaskLine.checked }
    : null;
  const listMatch = taskLine ? null : /^(\s*)([-*+]|\d+[.)])\s+/.exec(text);
  const lineClasses = getMarkdownLineClasses(text);
  if (lineClasses) {
    builders.decorations.push(
      Decoration.line({
        class: lineClasses,
        attributes: getMarkdownLineAttributes(taskLine, listMatch),
      }).range(lineFrom),
    );
  }

  const headingMatch = /^(#{1,6})(\s|$)/.exec(text);
  if (headingMatch) {
    addSourceSyntaxDecoration(builders, lineFrom, lineFrom + headingMatch[0].length, "heading", false);
  }

  const blockquoteMarker = /^(\s*>+\s?)/.exec(text);
  if (blockquoteMarker) {
    addSourceSyntaxDecoration(builders, lineFrom, lineFrom + blockquoteMarker[1].length, "blockquote", false);
  }

  if (taskLine) {
    addSourceSyntaxDecoration(builders, taskLine.prefixFrom, taskLine.prefixTo, "task", false);
    builders.decorations.push(
      Decoration.widget({
        widget: new TaskCheckboxWidget(taskLine),
        side: -1,
      }).range(taskLine.prefixTo),
    );
    addInlineMarkdownDecorations(
      state,
      lineFrom,
      text,
      builders,
      inlineRevealRange,
      expandedImageRange,
      markdownLinkGraph,
      documentPath,
      markdownAssetUrlResolver,
      [{ from: taskLine.prefixFrom, to: taskLine.prefixTo }],
    );
    return;
  }

  if (listMatch) {
    addSourceSyntaxDecoration(builders, lineFrom, lineFrom + listMatch[0].length, "list", false);
  }

  addInlineMarkdownDecorations(
    state,
    lineFrom,
    text,
    builders,
    inlineRevealRange,
    expandedImageRange,
    markdownLinkGraph,
    documentPath,
    markdownAssetUrlResolver,
  );
}

function findTaskCheckboxPlan(
  plans: readonly IndexedMarkdownPlan[],
  lineFrom: number,
  lineTo: number,
): TaskCheckboxPlan | null {
  for (const { element, plan } of plans) {
    if (plan.sourceRange.from >= lineTo || plan.sourceRange.to <= lineFrom) continue;
    if (element.kind !== "task") continue;
    if (plan.presentation !== "inlineAtom" || plan.atom.kind !== "taskCheckbox") continue;
    return plan as TaskCheckboxPlan;
  }
  return null;
}

export function resetMarkdownDecorationDiagnostics() {
  markdownDecorationDiagnostics.rangeBuilds = 0;
  markdownDecorationDiagnostics.linesScanned = 0;
  markdownDecorationDiagnostics.fullDocumentScans = 0;
}

export function getMarkdownDecorationDiagnostics() {
  return { ...markdownDecorationDiagnostics };
}

function getMarkdownLineAttributes(
  taskLine: MarkdownTaskLine | null,
  listMatch: RegExpExecArray | null,
): Record<string, string> | undefined {
  if (taskLine) return { style: `--md-list-depth:${taskLine.depth};` };
  if (!listMatch) return undefined;

  const marker = cssString(getListMarkerText(listMatch[2]));
  const depth = getListDepth(listMatch[1]);
  return { style: `--md-list-depth:${depth};--md-list-marker:${marker};` };
}

function cssString(value: string): string {
  return JSON.stringify(value);
}

function getMarkdownLineClasses(text: string): string {
  const classes: string[] = [];

  const headingMatch = /^(#{1,6})(?:\s|$)/.exec(text);
  if (headingMatch) {
    classes.push("cm-md-heading", `cm-md-heading-${headingMatch[1].length}`);
  }

  if (/^\s*>/.test(text)) classes.push("cm-md-blockquote");
  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(text)) classes.push("cm-md-list-line");
  if (/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(text)) classes.push("cm-md-task-line");
  if (/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/.test(text)) classes.push("cm-md-task-checked");
  if (/^\s*(`{3,}|~{3,})/.test(text)) classes.push("cm-md-code-fence");
  if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(text)) classes.push("cm-md-hr");
  if (isMarkdownTableSourceLine(text)) classes.push("cm-md-table-line");

  return classes.join(" ");
}

function getListMarkerText(marker: string): string {
  if (/^\d+[.)]$/.test(marker)) return marker;
  return "\u2022";
}

function getListDepth(leadingWhitespace: string): number {
  return Math.floor(leadingWhitespace.replace(/\t/g, "    ").length / 2);
}
