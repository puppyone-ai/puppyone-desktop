import type { MarkdownElementPlan } from "../../core/plans/markdownPlanTypes";
import {
  BLOCK_EMBED_CAPABILITIES,
  rangeOf,
  visibleSourcePlan,
} from "../../core/plans/planPrimitives";
import type { MarkdownElement } from "../../core/syntax/markdownElements";
import { isMermaidCodeBlockLanguage } from "./codeBlockModel";

export function compileCodeBlockElementPlan(
  element: MarkdownElement,
): MarkdownElementPlan {
  if (element.kind !== "fence") return visibleSourcePlan(rangeOf(element), []);
  const fenceData = element.blockData?.kind === "fence" ? element.blockData : null;
  if (!fenceData) {
    return visibleSourcePlan(rangeOf(element), [
      { code: "fence.missing-data", message: "fence block data unavailable" },
    ]);
  }

  const { language, sourceReference, code } = fenceData;
  return {
    presentation: "blockAtom",
    sourceRange: rangeOf(element),
    embed: isMermaidCodeBlockLanguage(language)
      ? { kind: "mermaid", language, sourceReference, code }
      : { kind: "codeBlock", language, sourceReference, code },
    layout: { estimatedHeight: estimateFenceHeight(code) },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}

function estimateFenceHeight(code: string): number {
  const lineCount = Math.max(1, code.split("\n").length);
  return Math.max(80, Math.min(42 + lineCount * 20, 1600));
}
