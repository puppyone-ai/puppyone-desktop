import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { getMarkdownHtmlBlock } from "../rendering/htmlBlockModel";
import { isMarkdownTableLine } from "../rendering/tableModel";
import { getMarkdownTaskLine } from "../rendering/taskModel";
import { findMarkdownImageTokens } from "../links/markdownImageModel";
import { findMarkdownLinkTokens } from "../links/markdownLinkModel";
import { findWikiLinkTokens } from "../links/wikiLinkModel";

export type MarkdownElementKind =
  | "blockquote"
  | "emphasis"
  | "fence"
  | "heading"
  | "htmlBlock"
  | "image"
  | "inlineCode"
  | "link"
  | "list"
  | "rule"
  | "strike"
  | "strong"
  | "table"
  | "task"
  | "wikiLink";

export type MarkdownMarkerRange = {
  from: number;
  to: number;
};

export type MarkdownElement = {
  kind: MarkdownElementKind;
  from: number;
  to: number;
  markerRanges: MarkdownMarkerRange[];
  contentRange?: MarkdownMarkerRange;
  lineFrom?: number;
  lineTo?: number;
  level?: number;
};

type LineSource = {
  from: number;
  to: number;
  number: number;
  text: string;
};

export function getMarkdownElements(state: EditorState): MarkdownElement[] {
  const elements: MarkdownElement[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter(nodeRef) {
      const node = nodeRef.node;
      const line = getLineSource(state, node.from);
      switch (node.name) {
        case "ATXHeading1":
        case "ATXHeading2":
        case "ATXHeading3":
        case "ATXHeading4":
        case "ATXHeading5":
        case "ATXHeading6":
          elements.push(createHeadingElement(node, line));
          return true;
        case "ListItem": {
          const listElement = createListElement(node, line);
          if (listElement) elements.push(listElement);
          return true;
        }
        case "Blockquote": {
          const quoteElement = createBlockquoteElement(node, line);
          if (quoteElement) elements.push(quoteElement);
          return true;
        }
        case "StrongEmphasis":
          elements.push(createMarkedInlineElement("strong", node, "EmphasisMark"));
          return true;
        case "Emphasis":
          elements.push(createMarkedInlineElement("emphasis", node, "EmphasisMark"));
          return true;
        case "InlineCode":
          elements.push(createMarkedInlineElement("inlineCode", node, "CodeMark"));
          return true;
        case "Link":
          elements.push(createLinkElement(node));
          return true;
        case "Autolink":
          elements.push(createAutolinkElement(node));
          return true;
        case "Image":
        case "ObsidianImageEmbed":
          elements.push(createMarkedInlineElement("image", node, ["LinkMark", "ObsidianImageMark"]));
          return true;
        case "HorizontalRule":
          elements.push({
            kind: "rule",
            from: node.from,
            to: node.to,
            markerRanges: [{ from: node.from, to: node.to }],
            lineFrom: line.from,
            lineTo: line.to,
          });
          return true;
        default:
          return true;
      }
    },
  });

  addExtendedLineElements(state, elements);
  elements.sort((left, right) => left.from - right.from || left.to - right.to || left.kind.localeCompare(right.kind));
  return dedupeElements(elements);
}

export function getInlineRevealElement(
  state: EditorState,
  caret: number,
  elements = getMarkdownElements(state),
): MarkdownElement | null {
  let best: MarkdownElement | null = null;
  for (const element of elements) {
    if (!isInlineRevealKind(element.kind)) continue;
    if (caret <= element.from || caret >= element.to) continue;
    if (!best || element.to - element.from < best.to - best.from) best = element;
  }
  return best;
}

export function isInlineRevealKind(kind: MarkdownElementKind): boolean {
  return (
    kind === "emphasis" ||
    kind === "inlineCode" ||
    kind === "link" ||
    kind === "strike" ||
    kind === "strong" ||
    kind === "wikiLink"
  );
}

export function getBlockMarkerAtVisibleStart(state: EditorState, caret: number): MarkdownMarkerRange | null {
  const line = state.doc.lineAt(caret);
  const element = getMarkdownElements(state).find((candidate) => (
    candidate.lineFrom === line.from &&
    isBlockMarkerDeletionKind(candidate.kind) &&
    getVisibleStart(candidate) === caret
  ));
  if (!element) return null;

  if (element.kind === "task") {
    const stagedTaskMarker = element.markerRanges.find((range) => state.sliceDoc(range.from, range.to).includes("["));
    return stagedTaskMarker ?? element.markerRanges[0] ?? null;
  }

  return element.markerRanges[0] ?? null;
}

function isBlockMarkerDeletionKind(kind: MarkdownElementKind): boolean {
  return kind === "blockquote" || kind === "heading" || kind === "list" || kind === "task";
}

function getVisibleStart(element: MarkdownElement): number {
  return element.markerRanges.reduce((start, range) => Math.max(start, range.to), element.from);
}

function createHeadingElement(node: SyntaxNode, line: LineSource): MarkdownElement {
  const markerRange = directChildRanges(node, "HeaderMark")[0] ?? { from: node.from, to: node.from };
  const markerTo = line.text[markerRange.to - line.from] === " " ? markerRange.to + 1 : markerRange.to;
  return {
    kind: "heading",
    from: node.from,
    to: node.to,
    markerRanges: [{ from: markerRange.from, to: markerTo }],
    contentRange: { from: markerTo, to: node.to },
    lineFrom: line.from,
    lineTo: line.to,
    level: markerRange.to - markerRange.from,
  };
}

function createListElement(node: SyntaxNode, line: LineSource): MarkdownElement | null {
  const markerRange = directChildRanges(node, "ListMark")[0];
  if (!markerRange) return null;
  const markerTo = line.text[markerRange.to - line.from] === " " ? markerRange.to + 1 : markerRange.to;
  return {
    kind: "list",
    from: node.from,
    to: node.to,
    markerRanges: [{ from: markerRange.from, to: markerTo }],
    contentRange: { from: markerTo, to: node.to },
    lineFrom: line.from,
    lineTo: line.to,
  };
}

function createBlockquoteElement(node: SyntaxNode, line: LineSource): MarkdownElement | null {
  const markerRange = directChildRanges(node, "QuoteMark")[0];
  if (!markerRange) return null;
  const markerTo = line.text[markerRange.to - line.from] === " " ? markerRange.to + 1 : markerRange.to;
  return {
    kind: "blockquote",
    from: node.from,
    to: node.to,
    markerRanges: [{ from: markerRange.from, to: markerTo }],
    contentRange: { from: markerTo, to: node.to },
    lineFrom: line.from,
    lineTo: line.to,
  };
}

function createMarkedInlineElement(
  kind: MarkdownElementKind,
  node: SyntaxNode,
  markerNames: string | readonly string[],
): MarkdownElement {
  const markerRanges = directChildRanges(node, markerNames);
  const contentFrom = markerRanges[0]?.to ?? node.from;
  const contentTo = markerRanges[markerRanges.length - 1]?.from ?? node.to;
  return {
    kind,
    from: node.from,
    to: node.to,
    markerRanges,
    contentRange: contentFrom <= contentTo ? { from: contentFrom, to: contentTo } : undefined,
  };
}

function createLinkElement(node: SyntaxNode): MarkdownElement {
  const markerRanges = directChildRanges(node, "LinkMark");
  const labelFrom = markerRanges[0]?.to ?? node.from;
  const labelTo = markerRanges[1]?.from ?? labelFrom;
  return {
    kind: "link",
    from: node.from,
    to: node.to,
    markerRanges,
    contentRange: { from: labelFrom, to: labelTo },
  };
}

function createAutolinkElement(node: SyntaxNode): MarkdownElement {
  const markerRanges = directChildRanges(node, "LinkMark");
  const contentFrom = markerRanges[0]?.to ?? node.from;
  const contentTo = markerRanges[1]?.from ?? node.to;
  return {
    kind: "link",
    from: node.from,
    to: node.to,
    markerRanges,
    contentRange: { from: contentFrom, to: contentTo },
  };
}

function addExtendedLineElements(state: EditorState, elements: MarkdownElement[]) {
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const taskLine = getMarkdownTaskLine(line);
    if (taskLine) {
      elements.push({
        kind: "task",
        from: taskLine.from,
        to: taskLine.to,
        markerRanges: [
          { from: taskLine.prefixFrom, to: taskLine.checkboxFrom },
          { from: taskLine.checkboxFrom, to: taskLine.prefixTo },
        ],
        contentRange: { from: taskLine.contentFrom, to: taskLine.contentTo },
        lineFrom: line.from,
        lineTo: line.to,
      });
    }

    for (const token of findWikiLinkTokens(line.text)) {
      const from = line.from + token.from;
      const to = line.from + token.to;
      const visibleFrom = line.from + (token.aliasFrom ?? token.targetFrom);
      const visibleTo = line.from + (token.aliasTo ?? token.targetTo);
      elements.push({
        kind: "wikiLink",
        from,
        to,
        markerRanges: [
          { from, to: visibleFrom },
          { from: visibleTo, to },
        ],
        contentRange: { from: visibleFrom, to: visibleTo },
      });
    }

    for (const token of findMarkdownImageTokens(line.text)) {
      elements.push({
        kind: "image",
        from: line.from + token.from,
        to: line.from + token.to,
        markerRanges: [{ from: line.from + token.from, to: line.from + token.to }],
        contentRange: { from: line.from + token.from, to: line.from + token.to },
      });
    }

    addStrikeElements(line, elements);
    if (isMarkdownTableLine(line.text)) {
      elements.push({
        kind: "table",
        from: line.from,
        to: line.to,
        markerRanges: [{ from: line.from, to: line.to }],
        lineFrom: line.from,
        lineTo: line.to,
      });
    }

    const htmlBlock = getMarkdownHtmlBlock(state, line.number);
    if (htmlBlock?.from === line.from) {
      elements.push({
        kind: "htmlBlock",
        from: htmlBlock.from,
        to: htmlBlock.to,
        markerRanges: [{ from: htmlBlock.from, to: htmlBlock.to }],
        lineFrom: line.from,
        lineTo: state.doc.line(htmlBlock.nextLineNumber - 1).to,
      });
    }
  }
}

function addStrikeElements(line: LineSource, elements: MarkdownElement[]) {
  for (const match of line.text.matchAll(/(~~)(\S(?:.*?\S)?)(~~)/g)) {
    if (match.index == null || !match[2]?.trim()) continue;
    const from = line.from + match.index;
    const openingTo = from + match[1].length;
    const closingFrom = openingTo + match[2].length;
    const to = closingFrom + match[3].length;
    elements.push({
      kind: "strike",
      from,
      to,
      markerRanges: [
        { from, to: openingTo },
        { from: closingFrom, to },
      ],
      contentRange: { from: openingTo, to: closingFrom },
    });
  }
}

function directChildRanges(node: SyntaxNode, markerNames: string | readonly string[]): MarkdownMarkerRange[] {
  const names = new Set(Array.isArray(markerNames) ? markerNames : [markerNames]);
  const ranges: MarkdownMarkerRange[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) ranges.push({ from: child.from, to: child.to });
  }
  return ranges;
}

function getLineSource(state: EditorState, pos: number): LineSource {
  const line = state.doc.lineAt(pos);
  return {
    from: line.from,
    to: line.to,
    number: line.number,
    text: line.text,
  };
}

function dedupeElements(elements: MarkdownElement[]): MarkdownElement[] {
  const seen = new Set<string>();
  const result: MarkdownElement[] = [];
  for (const element of elements) {
    if (
      element.kind === "link" &&
      result.some((candidate) => candidate.kind === "wikiLink" && element.from >= candidate.from && element.to <= candidate.to)
    ) {
      continue;
    }

    const key = `${element.kind}:${element.from}:${element.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(element);
  }
  return result;
}
