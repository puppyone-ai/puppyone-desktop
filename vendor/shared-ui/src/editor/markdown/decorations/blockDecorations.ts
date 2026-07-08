import type { EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../../viewerTypes";
import { getMarkdownCodeBlock, isMermaidCodeBlockLanguage } from "../rendering/codeBlockModel";
import { getMarkdownHtmlBlock } from "../rendering/htmlBlockModel";
import { getMarkdownTableBlock, isMarkdownTableSourceLine } from "../rendering/tableModel";
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

    const codeBlock = getMarkdownCodeBlock(state, line.number);
    if (codeBlock) {
      const widget = isMermaidCodeBlockLanguage(codeBlock.language)
        ? new MermaidBlockWidget(codeBlock.code, codeBlock.language || "mermaid", codeBlock.from, codeBlock.to)
        : new CodeBlockWidget(codeBlock.code, codeBlock.language, codeBlock.from, codeBlock.to);
      addReplacementDecoration(
        builders,
        Decoration.replace({
          widget,
          block: true,
        }),
        codeBlock.from,
        codeBlock.to,
      );
      lineNumber = codeBlock.nextLineNumber;
      continue;
    }

    const htmlBlock = getMarkdownHtmlBlock(state, line.number);
    if (htmlBlock) {
      addReplacementDecoration(
        builders,
        Decoration.replace({
          widget: new HtmlBlockWidget(htmlBlock, htmlTrustMode, documentPath, markdownAssetUrlResolver),
          block: true,
        }),
        htmlBlock.from,
        htmlBlock.to,
      );
      lineNumber = htmlBlock.nextLineNumber;
      continue;
    }

    const tableBlock = getMarkdownTableBlock(state, line.number);
    if (tableBlock) {
      addReplacementDecoration(
        builders,
        Decoration.replace({
          widget: new MarkdownTableWidget(
            tableBlock.from,
            tableBlock.to,
            tableBlock.alignments,
            tableBlock.rows,
            markdownLinkGraph,
            documentPath,
            markdownAssetUrlResolver,
          ),
          block: true,
        }),
        tableBlock.from,
        tableBlock.to,
      );
      lineNumber = tableBlock.nextLineNumber;
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
    );
    lineNumber += 1;
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
