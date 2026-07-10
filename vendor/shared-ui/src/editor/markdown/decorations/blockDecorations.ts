import type { EditorState } from "@codemirror/state";
import { Decoration, type WidgetType } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../../viewerTypes";
import { getMarkdownPlansInRange } from "../plans/markdownPlanIndex";
import type { MarkdownElementPlan } from "../plans/markdownPlanTypes";
import { isMarkdownTableSourceLine } from "../rendering/tableModel";
import { getMarkdownTaskLine, type MarkdownTaskLine } from "../rendering/taskModel";
import type { ComposingBlockLine } from "../state/composingBlockLine";
import type { ExpandedImageRange } from "../state/expandedImage";
import { CodeBlockWidget } from "../widgets/codeBlockWidget";
import { HtmlBlockWidget } from "../widgets/htmlBlockWidget";
import { HorizontalRuleWidget, TaskCheckboxWidget } from "../widgets/inlineWidgets";
import { MermaidBlockWidget } from "../widgets/mermaidBlockWidget";
import { MarkdownTableWidget } from "../widgets/table/tableWidget";
import {
  addReplacementDecoration,
  addSourceSyntaxDecoration,
  type InlineRevealRange,
  type MarkdownDecorationBuilders,
} from "./decorationPrimitives";
import { addInlineMarkdownDecorations } from "./inlineDecorations";

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
) {
  const lineCount = state.doc.lines;

  for (let lineNumber = 1; lineNumber <= lineCount;) {
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

    const blockPlan = findBlockAtomPlanAtLineStart(state, line.from);
    if (blockPlan) {
      const widget = createWidgetFromBlockPlan(
        blockPlan,
        htmlTrustMode,
        markdownLinkGraph,
        documentPath,
        markdownAssetUrlResolver,
      );
      if (widget) {
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
    );
    lineNumber += 1;
  }
}

function findBlockAtomPlanAtLineStart(
  state: EditorState,
  lineFrom: number,
): Extract<MarkdownElementPlan, { presentation: "blockAtom" }> | null {
  for (const { plan } of getMarkdownPlansInRange(state, lineFrom, lineFrom + 1)) {
    if (plan.presentation !== "blockAtom") continue;
    if (plan.sourceRange.from !== lineFrom) continue;
    if (
      plan.embed.kind === "codeBlock" ||
      plan.embed.kind === "mermaid" ||
      plan.embed.kind === "table" ||
      plan.embed.kind === "htmlBlock"
    ) {
      return plan;
    }
  }
  return null;
}

function createWidgetFromBlockPlan(
  plan: Extract<MarkdownElementPlan, { presentation: "blockAtom" }>,
  htmlTrustMode: MarkdownHtmlTrustMode,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
): WidgetType | null {
  const { embed, sourceRange } = plan;
  switch (embed.kind) {
    case "codeBlock":
      return new CodeBlockWidget(embed.code, embed.language, sourceRange.from, sourceRange.to);
    case "mermaid":
      return new MermaidBlockWidget(embed.code, embed.language || "mermaid", sourceRange.from, sourceRange.to);
    case "table":
      return new MarkdownTableWidget(
        sourceRange.from,
        sourceRange.to,
        [...embed.alignments],
        embed.rows.map((row) => ({
          header: row.header,
          lineTo: row.lineTo,
          cells: row.cells.map((cell) => ({ ...cell })),
        })),
        markdownLinkGraph,
        documentPath,
        markdownAssetUrlResolver,
      );
    case "htmlBlock":
      return new HtmlBlockWidget(
        {
          from: sourceRange.from,
          to: sourceRange.to,
          nextLineNumber: 0,
          source: embed.source,
          tagName: embed.tagName ?? "",
          closed: embed.closed,
        },
        htmlTrustMode,
        documentPath,
        markdownAssetUrlResolver,
      );
    default:
      return null;
  }
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
) {
  const taskLine = getMarkdownTaskLine({ from: lineFrom, to: lineTo, text });
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

  const hrMatch = /^(\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*)$/.exec(text);
  if (hrMatch && lineFrom < lineTo) {
    addReplacementDecoration(
      builders,
      Decoration.replace({
        widget: new HorizontalRuleWidget(),
        inclusive: false,
      }),
      lineFrom,
      lineFrom + hrMatch[1].length,
    );
    return;
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
