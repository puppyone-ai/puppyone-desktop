import type { MarkdownElementPlan } from "../../core/plans/markdownPlanTypes";
import {
  BLOCK_EMBED_CAPABILITIES,
  rangeOf,
  visibleSourcePlan,
} from "../../core/plans/planPrimitives";
import type { MarkdownElement } from "../../core/syntax/markdownElements";
import {
  createMarkdownTableRenderKey,
  estimateMarkdownTableLayoutHeight,
} from "./tableLayout";

export function compileTableElementPlan(
  element: MarkdownElement,
): MarkdownElementPlan {
  if (element.kind !== "table") return visibleSourcePlan(rangeOf(element), []);
  const tableData = element.blockData?.kind === "table" ? element.blockData : null;
  if (!tableData) {
    return visibleSourcePlan(rangeOf(element), [
      { code: "table.missing-data", message: "table block data unavailable" },
    ]);
  }

  return {
    presentation: "blockAtom",
    sourceRange: rangeOf(element),
    embed: {
      kind: "table",
      alignments: tableData.alignments,
      rows: tableData.rows,
      renderKey: createMarkdownTableRenderKey(tableData.alignments, tableData.rows),
    },
    layout: { estimatedHeight: estimateMarkdownTableLayoutHeight(tableData.rows) },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}
