import { defineMarkdownFeature } from "../../core/features/markdownFeatureContract";
import { getMarkdownHtmlBlock } from "./htmlBlockModel";
import { HtmlBlockWidget } from "./htmlBlockWidget";
import { getMarkdownInlineHtmlInRange } from "./inlineHtmlModel";
import { compileHtmlBlockElementPlan, compileInlineHtmlElementPlan } from "./htmlPlan";

export const htmlFeature = defineMarkdownFeature({
  id: "html",
  semanticKinds: ["inlineHtml", "htmlBlock"],
  inlineWidgetKinds: [],
  blockWidgetKinds: ["htmlBlock"],
  collectRange(state, from, to) {
    return getMarkdownInlineHtmlInRange(state, from, to).map((inlineHtml) => ({
      kind: "inlineHtml" as const,
      from: inlineHtml.from,
      to: inlineHtml.to,
      markerRanges: [
        inlineHtml.openingMarker,
        ...(inlineHtml.closingMarker ? [inlineHtml.closingMarker] : []),
      ],
      contentRange: inlineHtml.contentRange ?? undefined,
      inlineHtml,
    }));
  },
  collectBlock(state, line) {
    const block = getMarkdownHtmlBlock(state, line.number);
    if (!block || block.from !== line.from) return null;
    return {
      nextLineNumber: block.nextLineNumber,
      element: {
        kind: "htmlBlock",
        from: block.from,
        to: block.to,
        markerRanges: [{ from: block.from, to: block.to }],
        lineFrom: line.from,
        lineTo: state.doc.line(block.nextLineNumber - 1).to,
        blockData: {
          kind: "htmlBlock",
          tagName: block.tagName,
          closed: block.closed,
          source: block.source,
          metrics: block.metrics,
        },
      },
    };
  },
  compile(element, context) {
    return element.kind === "inlineHtml"
      ? compileInlineHtmlElementPlan(element)
      : compileHtmlBlockElementPlan(element, context.documentProfile);
  },
  createBlockWidget(plan, context) {
    const { embed, sourceRange } = plan;
    return new HtmlBlockWidget(
      {
        from: sourceRange.from,
        to: sourceRange.to,
        nextLineNumber: 0,
        source: embed.source,
        tagName: embed.tagName ?? "",
        closed: embed.closed,
        metrics: {
          logicalItems: plan.complexity.logicalItems,
          estimatedDomNodes: plan.complexity.estimatedDomNodes,
          nestingDepth: plan.complexity.nestingDepth,
          assetCount: plan.complexity.assetCount,
        },
      },
      context.htmlTrustMode,
      context.documentPath,
      context.markdownAssetUrlResolver,
      plan.layout.estimatedHeight,
      plan.execution,
    );
  },
});
