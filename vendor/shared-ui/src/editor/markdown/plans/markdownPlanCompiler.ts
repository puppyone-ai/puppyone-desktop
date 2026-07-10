import type { MarkdownElement } from "../syntax/markdownElements";
import { isMermaidCodeBlockLanguage } from "../rendering/codeBlockModel";
import { compileInlineHtmlRenderPlan } from "../policy/inlineHtmlPolicy";
import type {
  BlockEmbedCapabilities,
  MarkdownDiagnostic,
  MarkdownElementPlan,
  SourceRange,
} from "./markdownPlanTypes";

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
      return compileImageAtomPlan(element);
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
      return compileFenceAtomPlan(element);
    case "table":
      return compileTableAtomPlan(element);
    case "htmlBlock":
      return compileHtmlBlockAtomPlan(element);
    case "rule":
      return compileHorizontalRuleAtomPlan(element);
    case "task":
      return compileTaskCheckboxAtomPlan(element);
    default:
      return visibleSourcePlan(rangeOf(element), []);
  }
}

function compileInlineHtmlElementPlan(element: Extract<MarkdownElement, { kind: "inlineHtml" }>): MarkdownElementPlan {
  const sourceRange = rangeOf(element);
  const policy = compileInlineHtmlRenderPlan(element.inlineHtml);

  if (!policy.supported) {
    return visibleSourcePlan(sourceRange, policy.diagnostics);
  }

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

function compileImageAtomPlan(element: MarkdownElement): MarkdownElementPlan {
  const imageData = element.blockData?.kind === "image" ? element.blockData : null;
  return {
    presentation: "inlineAtom",
    sourceRange: rangeOf(element),
    atom: {
      kind: "image",
      alt: imageData?.alt ?? "",
      href: imageData?.href ?? "",
      title: imageData?.title ?? null,
    },
    layout: { lineBreaks: 0, estimatedHeight: 120 },
    diagnostics: imageData ? [] : [{ code: "image.missing-data", message: "image token data unavailable" }],
    capabilities: {
      reveal: false,
      atomic: true,
      deleteUnits: [cloneRange(rangeOf(element))],
      expand: true,
    },
  };
}

function compileFenceAtomPlan(element: MarkdownElement): MarkdownElementPlan {
  const fenceData = element.blockData?.kind === "fence" ? element.blockData : null;
  if (!fenceData) {
    return visibleSourcePlan(rangeOf(element), [
      { code: "fence.missing-data", message: "fence block data unavailable" },
    ]);
  }

  const { language, code } = fenceData;
  const isMermaid = isMermaidCodeBlockLanguage(language);

  return {
    presentation: "blockAtom",
    sourceRange: rangeOf(element),
    embed: isMermaid
      ? { kind: "mermaid", language, code }
      : { kind: "codeBlock", language, code },
    layout: { estimatedHeight: estimateFenceHeight(code) },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}

function compileTableAtomPlan(element: MarkdownElement): MarkdownElementPlan {
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
    },
    layout: { estimatedHeight: Math.max(80, 28 + tableData.rows.length * 28) },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}

function compileHtmlBlockAtomPlan(element: MarkdownElement): MarkdownElementPlan {
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
    layout: { estimatedHeight: estimateHtmlBlockHeight(htmlData.source) },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}

function compileHorizontalRuleAtomPlan(element: MarkdownElement): MarkdownElementPlan {
  return {
    presentation: "blockAtom",
    sourceRange: rangeOf(element),
    embed: { kind: "horizontalRule" },
    layout: { estimatedHeight: 32 },
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

  return {
    presentation: "blockAtom",
    sourceRange: rangeOf(element),
    embed: { kind: "taskCheckbox", checked: taskData.checked },
    layout: { estimatedHeight: 28 },
    diagnostics: [],
    capabilities: BLOCK_EMBED_CAPABILITIES,
  };
}

function visibleSourcePlan(
  sourceRange: SourceRange,
  diagnostics: readonly MarkdownDiagnostic[],
): MarkdownElementPlan {
  return {
    presentation: "visibleSource",
    sourceRange,
    diagnostics,
    capabilities: { reveal: false, atomic: false, deleteUnits: [] },
  };
}

function rangeOf(element: { from: number; to: number }): SourceRange {
  return { from: element.from, to: element.to };
}

function cloneRange(range: SourceRange): SourceRange {
  return { from: range.from, to: range.to };
}

function estimateFenceHeight(code: string): number {
  const lineCount = Math.max(1, code.split("\n").length);
  return Math.max(80, Math.min(42 + lineCount * 20, 1600));
}

function estimateHtmlBlockHeight(source: string): number {
  const lineCount = Math.max(1, source.split("\n").length);
  return Math.max(80, Math.min(Math.max(80, lineCount * 24) + 32, 2400));
}

const BLOCK_EMBED_CAPABILITIES: BlockEmbedCapabilities = {
  reveal: false,
  atomic: true,
  deleteUnits: [],
};
