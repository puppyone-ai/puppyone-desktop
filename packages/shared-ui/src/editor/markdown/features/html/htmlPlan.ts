import type { MarkdownElementPlan } from "../../core/plans/markdownPlanTypes";
import {
  BLOCK_EMBED_CAPABILITIES,
  cloneRange,
  rangeOf,
  visibleSourcePlan,
} from "../../core/plans/planPrimitives";
import type { MarkdownElement } from "../../core/syntax/markdownElements";
import { compileInlineHtmlRenderPlan } from "./inlineHtmlPolicy";
import { estimateHtmlBlockLayoutHeight } from "./htmlBlockLayout";

export function compileInlineHtmlElementPlan(
  element: Extract<MarkdownElement, { kind: "inlineHtml" }>,
): MarkdownElementPlan {
  const sourceRange = rangeOf(element);
  const policy = compileInlineHtmlRenderPlan(element.inlineHtml);

  if (!policy.supported) return visibleSourcePlan(sourceRange, policy.diagnostics);

  if (policy.value.kind === "lineBreak") {
    return {
      presentation: "inlineAtom",
      sourceRange,
      atom: { kind: "lineBreak" },
      layout: { lineBreaks: 1 },
      diagnostics: policy.value.diagnostics,
      capabilities: {
        reveal: true,
        atomic: true,
        deleteUnits: [cloneRange(sourceRange)],
        expand: true,
      },
    };
  }

  const contentRange = element.contentRange;
  if (!contentRange || contentRange.from >= contentRange.to) {
    return visibleSourcePlan(sourceRange, [
      ...policy.value.diagnostics,
      { code: "inline-html.empty-content", message: "inline HTML content range is empty" },
    ]);
  }

  return {
    presentation: "inlineMark",
    sourceRange,
    contentRange: cloneRange(contentRange),
    markerRanges: element.markerRanges.map(cloneRange),
    mark: {
      kind: "inlineHtmlMark",
      tagName: policy.value.tagName,
      className: "cm-md-inline-html",
      attributes: policy.value.attributes,
    },
    diagnostics: policy.value.diagnostics,
    capabilities: {
      reveal: true,
      atomic: true,
      deleteUnits: element.markerRanges.map(cloneRange),
    },
  };
}

export function compileHtmlBlockElementPlan(
  element: MarkdownElement,
): MarkdownElementPlan {
  if (element.kind !== "htmlBlock") return visibleSourcePlan(rangeOf(element), []);
  const htmlData = element.blockData?.kind === "htmlBlock" ? element.blockData : null;
  if (!htmlData) {
    return visibleSourcePlan(rangeOf(element), [
      { code: "htmlBlock.missing-data", message: "HTML block data unavailable" },
    ]);
  }

  return {
    presentation: "blockAtom",
    sourceRange: rangeOf(element),
    embed: {
      kind: "htmlBlock",
      tagName: htmlData.tagName,
      closed: htmlData.closed,
      source: htmlData.source,
    },
    layout: { estimatedHeight: estimateHtmlBlockLayoutHeight(htmlData.source) },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}
