import type { MarkdownElement } from "../syntax/markdownElements";
import { compileInlineHtmlRenderPlan } from "../policy/inlineHtmlPolicy";
import type {
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
  return {
    presentation: "inlineAtom",
    sourceRange: rangeOf(element),
    atom: { kind: "image", alt: "", href: "", title: null },
    layout: { lineBreaks: 0, estimatedHeight: 120 },
    diagnostics: [],
    capabilities: {
      reveal: false,
      atomic: true,
      deleteUnits: [cloneRange(rangeOf(element))],
      expand: true,
    },
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
