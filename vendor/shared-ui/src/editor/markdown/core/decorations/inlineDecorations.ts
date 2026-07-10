import type { EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownLinkGraph } from "../../../viewerTypes";
import { createMarkdownImageFeatureWidget } from "../../features/inlineFeatureRegistry";
import { findMarkdownImageTokens } from "../../features/image/markdownImageModel";
import { findMarkdownLinkTokens, isExternalMarkdownHref } from "../links/markdownLinkModel";
import { findWikiLinkTokens } from "../links/wikiLinkModel";
import { compileMarkdownElementPlan } from "../plans/markdownPlanCompiler";
import type { MarkdownElementPlan } from "../plans/markdownPlanTypes";
import { isSafeHref } from "../../platform/policy/markdownHtmlSanitizerPolicy";
import type { ExpandedImageRange } from "../state/expandedImage";
import {
  getMarkdownElementsInRange,
  isInlineDecorationKind,
  type MarkdownElement,
} from "../syntax/markdownElements";
import { InlineHtmlLineBreakWidget } from "../widgets/inlineWidgets";
import {
  addReplacementDecoration,
  addSourceSyntaxDecoration,
  isRevealedInlineRange,
  reserveRange,
  type InlineRevealRange,
  type MarkdownDecorationBuilders,
  type OccupiedRange,
} from "./decorationPrimitives";

export function addInlineMarkdownDecorations(
  state: EditorState,
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  expandedImageRange: ExpandedImageRange | null,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  initialOccupied: OccupiedRange[] = [],
) {
  const occupied = [...initialOccupied];
  const lineTo = lineFrom + text.length;
  const elements = getMarkdownElementsInRange(state, lineFrom, lineTo)
    .filter((element) => isInlineDecorationKind(element.kind))
    .sort(compareInlineDecorationPriority);

  for (const element of elements) {
    if (element.kind === "inlineHtml") {
      // A multi-line inline element intersects every physical line it spans.
      // Emit its range decorations exactly once, from the line that owns the
      // opening marker.
      if (element.from < lineFrom || element.from > lineTo) continue;
      addInlineHtmlElementDecoration(element, builders, inlineRevealRange);
      continue;
    }
    const overlapsExclusiveRange = occupied.some((range) => (
      element.from < range.to && element.to > range.from
    ));
    if (element.kind === "image") {
      if (!reserveRange(occupied, element.from, element.to)) continue;
    } else if (overlapsExclusiveRange) {
      continue;
    }

    switch (element.kind) {
      case "image":
        addImageElementDecoration(element, lineFrom, text, builders, expandedImageRange, documentPath, markdownAssetUrlResolver);
        break;
      case "wikiLink":
        addWikiLinkElementDecoration(element, lineFrom, text, builders, inlineRevealRange, markdownLinkGraph, documentPath);
        break;
      case "link":
        addLinkElementDecoration(element, lineFrom, text, builders, inlineRevealRange, markdownLinkGraph, documentPath);
        break;
      case "strong":
        addDelimitedInlineElementDecoration(element, builders, inlineRevealRange, "cm-md-syntax-strong");
        break;
      case "emphasis":
        addDelimitedInlineElementDecoration(element, builders, inlineRevealRange, "cm-md-syntax-emphasis");
        break;
      case "inlineCode":
        addDelimitedInlineElementDecoration(element, builders, inlineRevealRange, "cm-md-syntax-monospace");
        break;
      case "strike":
        addDelimitedInlineElementDecoration(element, builders, inlineRevealRange, "cm-md-syntax-strikethrough");
        break;
      case "escape":
        addEscapeElementDecoration(element, builders);
        break;
      default:
        break;
    }
  }
}

function compareInlineDecorationPriority(left: MarkdownElement, right: MarkdownElement): number {
  const priority = (element: MarkdownElement): number => {
    switch (element.kind) {
      case "image":
        return 0;
      case "inlineHtml":
        return 1;
      case "wikiLink":
        return 2;
      case "link":
        return 3;
      case "inlineCode":
        return 4;
      case "strong":
        return 5;
      case "strike":
        return 6;
      case "emphasis":
        return 7;
      case "escape":
        return 8;
      default:
        return 9;
    }
  };

  return priority(left) - priority(right) || left.from - right.from || right.to - left.to;
}

function addInlineHtmlElementDecoration(
  element: MarkdownElement,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
) {
  if (element.kind !== "inlineHtml") return;
  const plan = compileMarkdownElementPlan(element);
  applyInlineHtmlPlan(plan, builders, inlineRevealRange);
}

function applyInlineHtmlPlan(
  plan: MarkdownElementPlan,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
) {
  if (plan.presentation === "visibleSource") return;

  const revealSourceSyntax = isRevealedInlineRange(
    plan.sourceRange.from,
    plan.sourceRange.to,
    inlineRevealRange,
  );

  if (plan.presentation === "inlineAtom" && plan.atom.kind === "lineBreak") {
    if (!revealSourceSyntax) {
      addReplacementDecoration(
        builders,
        Decoration.replace({
          widget: new InlineHtmlLineBreakWidget(plan.layout.lineBreaks),
          inclusive: false,
        }),
        plan.sourceRange.from,
        plan.sourceRange.to,
      );
    } else {
      addSourceSyntaxDecoration(
        builders,
        plan.sourceRange.from,
        plan.sourceRange.to,
        "inline-html",
        true,
      );
    }
    return;
  }

  if (plan.presentation !== "inlineMark" || plan.mark.kind !== "inlineHtmlMark") return;

  for (const markerRange of plan.markerRanges) {
    addSourceSyntaxDecoration(builders, markerRange.from, markerRange.to, "inline-html", revealSourceSyntax);
  }

  if (plan.contentRange.from >= plan.contentRange.to) return;
  builders.decorations.push(
    Decoration.mark({
      tagName: plan.mark.tagName,
      class: plan.mark.className ?? "cm-md-inline-html",
      attributes: plan.mark.attributes,
      inclusive: false,
    }).range(plan.contentRange.from, plan.contentRange.to),
  );
}

function addDelimitedInlineElementDecoration(
  element: MarkdownElement,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  contentClass: string,
) {
  const contentRange = element.contentRange;
  if (!contentRange || contentRange.from >= contentRange.to) return;

  const revealSourceSyntax = isRevealedInlineRange(element.from, element.to, inlineRevealRange);
  for (const markerRange of element.markerRanges) {
    addSourceSyntaxDecoration(builders, markerRange.from, markerRange.to, "delimiter", revealSourceSyntax);
  }
  builders.decorations.push(Decoration.mark({ class: contentClass }).range(contentRange.from, contentRange.to));
}

function addEscapeElementDecoration(element: MarkdownElement, builders: MarkdownDecorationBuilders) {
  for (const markerRange of element.markerRanges) {
    addSourceSyntaxDecoration(builders, markerRange.from, markerRange.to, "escape", false);
  }
}

function addImageElementDecoration(
  element: MarkdownElement,
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  expandedImageRange: ExpandedImageRange | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
) {
  if (expandedImageRange?.from === element.from && expandedImageRange.to === element.to) return;

  const token = findMarkdownImageTokens(text).find((candidate) => (
    lineFrom + candidate.from === element.from &&
    lineFrom + candidate.to === element.to
  ));
  if (!token) return;

  addReplacementDecoration(
    builders,
    Decoration.replace({
      widget: createMarkdownImageFeatureWidget({
        from: element.from,
        to: element.to,
        alt: token.alt,
        source: token.href,
        title: token.title,
        documentPath,
      }),
      inclusive: false,
    }),
    element.from,
    element.to,
  );
}

function addWikiLinkElementDecoration(
  element: MarkdownElement,
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
) {
  const token = findWikiLinkTokens(text).find((candidate) => (
    lineFrom + candidate.from === element.from &&
    lineFrom + candidate.to === element.to
  ));
  if (!token || !element.contentRange || element.contentRange.from >= element.contentRange.to) return;

  const resolvedTarget = markdownLinkGraph?.resolveWikiLink(documentPath, token.target) ?? null;
  const classes = [
    "cm-md-syntax-link",
    "cm-md-wiki-link-label",
    resolvedTarget?.exists ? "is-resolved" : "is-missing",
    resolvedTarget?.ambiguous ? "is-ambiguous" : "",
  ].filter(Boolean).join(" ");
  const revealSourceSyntax = isRevealedInlineRange(element.from, element.to, inlineRevealRange);

  addInlineSourceSyntaxDecorations(builders, element, revealSourceSyntax);
  builders.decorations.push(
    Decoration.mark({
      class: classes,
      attributes: {
        "data-wiki-target": token.target,
        role: "link",
        tabindex: "0",
        "aria-label": getWikiLinkTitle(resolvedTarget, token.target),
        title: getMarkdownOpenTitle(getWikiLinkTitle(resolvedTarget, token.target)),
      },
    }).range(element.contentRange.from, element.contentRange.to),
  );
}

function addLinkElementDecoration(
  element: MarkdownElement,
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
) {
  if (!element.contentRange || element.contentRange.from >= element.contentRange.to) return;

  const token = findMarkdownLinkTokens(text).find((candidate) => (
    lineFrom + candidate.from === element.from &&
    lineFrom + candidate.to === element.to
  ));
  const href = token?.href ?? getAutolinkHref(element, lineFrom, text);
  if (!href) return;

  const resolvedTarget = markdownLinkGraph?.resolveMarkdownLink(documentPath, href) ?? null;
  const linkClasses = [
    "cm-md-syntax-link",
    "cm-md-link-label",
    resolvedTarget ? "cm-md-document-link-label" : "",
    resolvedTarget?.exists ? "is-resolved" : "",
    resolvedTarget && !resolvedTarget.exists ? "is-missing" : "",
    resolvedTarget?.ambiguous ? "is-ambiguous" : "",
    isExternalMarkdownHref(href) && isSafeHref(href) ? "is-external" : "",
  ].filter(Boolean).join(" ");
  const revealSourceSyntax = isRevealedInlineRange(element.from, element.to, inlineRevealRange);

  addInlineSourceSyntaxDecorations(builders, element, revealSourceSyntax);
  builders.decorations.push(
    Decoration.mark({
      class: linkClasses,
      attributes: {
        "data-md-href": href,
        role: "link",
        tabindex: "0",
        "aria-label": getMarkdownLinkTitle(resolvedTarget, href),
        title: getMarkdownOpenTitle(getMarkdownLinkTitle(resolvedTarget, href)),
      },
    }).range(element.contentRange.from, element.contentRange.to),
  );
}

function getAutolinkHref(element: MarkdownElement, lineFrom: number, text: string): string | null {
  if (!element.contentRange || text[element.from - lineFrom] !== "<") return null;
  const href = text.slice(element.contentRange.from - lineFrom, element.contentRange.to - lineFrom).trim();
  return href || null;
}

function addInlineSourceSyntaxDecorations(
  builders: MarkdownDecorationBuilders,
  element: MarkdownElement,
  revealSourceSyntax: boolean,
) {
  const contentRange = element.contentRange;
  if (!contentRange) return;

  addSourceSyntaxDecoration(builders, element.from, contentRange.from, element.kind === "wikiLink" ? "wiki-link" : "link", revealSourceSyntax);
  addSourceSyntaxDecoration(builders, contentRange.to, element.to, element.kind === "wikiLink" ? "wiki-link" : "link", revealSourceSyntax);
}

function getMarkdownOpenTitle(target: string): string {
  return `Cmd/Ctrl-click to open: ${target}`;
}

function getWikiLinkTitle(
  resolvedTarget: ReturnType<MarkdownLinkGraph["resolveWikiLink"]> | null,
  target: string,
): string {
  if (!resolvedTarget) return target;
  if (!resolvedTarget.exists) return `Missing linked note: ${target}`;
  if (resolvedTarget.ambiguous) return `${resolvedTarget.path} (ambiguous title match)`;
  return resolvedTarget.path ?? target;
}

function getMarkdownLinkTitle(
  resolvedTarget: ReturnType<MarkdownLinkGraph["resolveMarkdownLink"]> | null,
  href: string,
): string {
  if (!resolvedTarget) return href;
  if (!resolvedTarget.exists) return `Missing linked note: ${href}`;
  if (resolvedTarget.ambiguous) return `${resolvedTarget.path} (ambiguous title match)`;
  return resolvedTarget.path ?? href;
}
