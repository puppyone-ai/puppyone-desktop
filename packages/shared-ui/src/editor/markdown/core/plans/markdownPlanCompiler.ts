import type { MarkdownElement } from "../syntax/markdownElements";
import { compileCodeBlockElementPlan } from "../../features/code-block/codeBlockPlan";
import { compileHtmlBlockElementPlan, compileInlineHtmlElementPlan } from "../../features/html/htmlPlan";
import { compileImageElementPlan } from "../../features/image/imagePlan";
import { compileTableElementPlan } from "../../features/table/tablePlan";
import type { MarkdownElementPlan } from "./markdownPlanTypes";
import { BLOCK_EMBED_CAPABILITIES, cloneRange, rangeOf, visibleSourcePlan } from "./planPrimitives";

/**
 * Compiles a semantic Markdown element into a typed render plan.
 * Incomplete / malformed / unrenderable constructs become visibleSource and
 * therefore have no collapsed-marker deletion capability.
 */
export function compileMarkdownElementPlan(element: MarkdownElement): MarkdownElementPlan {
  switch (element.kind) {
    case "inlineHtml":
      return compileInlineHtmlElementPlan(element);
    case "strong":
      return compileDelimitedInlineMarkPlan(element, "strong", "cm-md-syntax-strong");
    case "emphasis":
      return compileDelimitedInlineMarkPlan(element, "emphasis", "cm-md-syntax-emphasis");
    case "strike":
      return compileDelimitedInlineMarkPlan(element, "strike", "cm-md-syntax-strikethrough");
    case "inlineCode":
      return compileDelimitedInlineMarkPlan(element, "inlineCode", "cm-md-syntax-monospace");
    case "link":
    case "wikiLink":
      return compileLinkLikePlan(element);
    case "image":
      return compileImageElementPlan(element);
    case "escape":
      return {
        presentation: "inlineAtom",
        sourceRange: rangeOf(element),
        atom: { kind: "escape" },
        layout: { lineBreaks: 0 },
        diagnostics: [],
        capabilities: {
          reveal: false,
          atomic: true,
          deleteUnits: element.markerRanges.map(cloneRange),
          expand: false,
        },
      };
    case "fence":
      return compileCodeBlockElementPlan(element);
    case "table":
      return compileTableElementPlan(element);
    case "htmlBlock":
      return compileHtmlBlockElementPlan(element);
    case "rule":
      return compileHorizontalRuleAtomPlan(element);
    case "task":
      return compileTaskCheckboxAtomPlan(element);
    default:
      return visibleSourcePlan(rangeOf(element), []);
  }
}

function compileDelimitedInlineMarkPlan(
  element: MarkdownElement,
  kind: "strong" | "emphasis" | "strike" | "inlineCode",
  className: string,
): MarkdownElementPlan {
  const contentRange = element.contentRange;
  if (!contentRange || contentRange.from >= contentRange.to) {
    return visibleSourcePlan(rangeOf(element), [
      { code: `${kind}.empty-content`, message: `${kind} content range is empty` },
    ]);
  }

  return {
    presentation: "inlineMark",
    sourceRange: rangeOf(element),
    contentRange: cloneRange(contentRange),
    markerRanges: element.markerRanges.map(cloneRange),
    mark: {
      kind,
      className,
      attributes: {},
    },
    diagnostics: [],
    capabilities: {
      reveal: true,
      atomic: true,
      deleteUnits: element.markerRanges.map(cloneRange),
    },
  };
}

function compileLinkLikePlan(element: MarkdownElement): MarkdownElementPlan {
  if (element.kind !== "link" && element.kind !== "wikiLink") {
    return visibleSourcePlan(rangeOf(element), []);
  }

  const contentRange = element.contentRange;
  if (!contentRange || contentRange.from >= contentRange.to) {
    return visibleSourcePlan(rangeOf(element), [
      { code: `${element.kind}.empty-content`, message: `${element.kind} content range is empty` },
    ]);
  }

  return {
    presentation: "inlineMark",
    sourceRange: rangeOf(element),
    contentRange: cloneRange(contentRange),
    markerRanges: element.markerRanges.map(cloneRange),
    mark: {
      kind: element.kind,
      className: element.kind === "wikiLink" ? "cm-md-wiki-link-label" : "cm-md-link-label",
      attributes: {},
    },
    diagnostics: [],
    capabilities: {
      reveal: true,
      atomic: true,
      deleteUnits: element.markerRanges.map(cloneRange),
    },
  };
}

function compileHorizontalRuleAtomPlan(element: MarkdownElement): MarkdownElementPlan {
  return {
    presentation: "blockAtom",
    sourceRange: rangeOf(element),
    embed: { kind: "horizontalRule" },
    layout: { estimatedHeight: 37 },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}

function compileTaskCheckboxAtomPlan(element: MarkdownElement): MarkdownElementPlan {
  const taskData = element.blockData?.kind === "task" ? element.blockData : null;
  if (!taskData) {
    return visibleSourcePlan(rangeOf(element), [
      { code: "task.missing-data", message: "task data unavailable" },
    ]);
  }

  const sourceRange = element.markerRanges[1] ?? rangeOf(element);
  return {
    presentation: "inlineAtom",
    sourceRange: cloneRange(sourceRange),
    atom: { kind: "taskCheckbox", checked: taskData.checked },
    layout: { lineBreaks: 0 },
    diagnostics: [],
    capabilities: {
      reveal: false,
      atomic: true,
      deleteUnits: [cloneRange(sourceRange)],
      expand: false,
    },
  };
}
