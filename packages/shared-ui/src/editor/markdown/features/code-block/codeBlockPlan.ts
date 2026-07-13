import type { MarkdownElementPlan } from "../../core/plans/markdownPlanTypes";
import {
  BLOCK_EMBED_CAPABILITIES,
  rangeOf,
  visibleSourcePlan,
} from "../../core/plans/planPrimitives";
import type { MarkdownElement } from "../../core/syntax/markdownElements";
import { isMermaidCodeBlockLanguage } from "./codeBlockModel";
import { estimateCodeBlockLayoutHeight, estimateMermaidLayoutHeight } from "./codeBlockLayout";

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
  const mermaid = isMermaidCodeBlockLanguage(language);
  return {
    presentation: "blockAtom",
    sourceRange: rangeOf(element),
    embed: mermaid
      ? { kind: "mermaid", language, sourceReference, code }
      : { kind: "codeBlock", language, sourceReference, code },
    layout: {
      estimatedHeight: mermaid
        ? estimateMermaidLayoutHeight(code)
        : estimateCodeBlockLayoutHeight(code),
    },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}
