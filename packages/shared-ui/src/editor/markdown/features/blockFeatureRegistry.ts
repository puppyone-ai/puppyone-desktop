import type { WidgetType } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../../viewerTypes";
import type { MarkdownElementPlan } from "../core/plans/markdownPlanTypes";
import { HorizontalRuleWidget } from "../core/widgets/inlineWidgets";
import { CodeBlockWidget } from "./code-block/codeBlockWidget";
import { HtmlBlockWidget } from "./html/htmlBlockWidget";
import { MermaidBlockWidget } from "./mermaid/mermaidBlockWidget";
import { MarkdownTableWidget } from "./table/tableWidget";

type MarkdownBlockPlan = Extract<MarkdownElementPlan, { presentation: "blockAtom" }>;

export type MarkdownBlockFeatureContext = {
  htmlTrustMode: MarkdownHtmlTrustMode;
  markdownLinkGraph: MarkdownLinkGraph | null;
  documentPath: string;
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null;
};

/**
 * Composition root for block-level Markdown features. Core decoration code
 * knows only the plan contract and this adapter, never concrete widgets.
 */
export function createMarkdownBlockFeatureWidget(
  plan: MarkdownBlockPlan,
  context: MarkdownBlockFeatureContext,
): WidgetType {
  const { embed, sourceRange } = plan;
  switch (embed.kind) {
    case "codeBlock":
      return new CodeBlockWidget(
        embed.code,
        embed.language,
        sourceRange.from,
        sourceRange.to,
        embed.sourceReference,
      );
    case "mermaid":
      return new MermaidBlockWidget(
        embed.code,
        embed.language || "mermaid",
        sourceRange.from,
        sourceRange.to,
        embed.sourceReference,
      );
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
        context.markdownLinkGraph,
        context.documentPath,
        context.markdownAssetUrlResolver,
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
        context.htmlTrustMode,
        context.documentPath,
        context.markdownAssetUrlResolver,
      );
    case "horizontalRule":
      return new HorizontalRuleWidget();
  }
}
