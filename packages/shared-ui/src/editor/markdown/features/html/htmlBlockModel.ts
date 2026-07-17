import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import type { MarkdownHtmlBlockMetrics } from "../../core/features/markdownFeatureData";
export type { MarkdownHtmlBlockMetrics } from "../../core/features/markdownFeatureData";
import {
  MARKDOWN_HTML_VOID_TAGS,
  scanMarkdownHtmlTagTokens,
  type MarkdownHtmlTagToken,
} from "./htmlTagTokenizer";

export type MarkdownHtmlBlock = {
  from: number;
  to: number;
  nextLineNumber: number;
  source: string;
  tagName: string;
  closed: boolean;
  metrics: MarkdownHtmlBlockMetrics;
};

export function getMarkdownHtmlBlock(state: EditorState, lineNumber: number): MarkdownHtmlBlock | null {
  const doc = state.doc;
  const firstLine = doc.line(lineNumber);
  const blockNode = findHtmlBlockStartingOnLine(state, firstLine.from, firstLine.to);
  if (!blockNode) return getStandaloneMediaHtmlBlock(state, lineNumber);

  const lastPosition = Math.max(blockNode.from, blockNode.to - 1);
  const lastLine = doc.lineAt(lastPosition);
  const from = firstLine.from;
  const to = lastLine.to;
  const source = state.sliceDoc(from, to);
  const tokens = scanMarkdownHtmlTagTokens(source, from);
  const opening = tokens.find((token) => !token.closing) ?? null;
  if (!opening) return null;

  return {
    from,
    to,
    nextLineNumber: lastLine.number + 1,
    source,
    tagName: opening.tagName,
    closed: isRootHtmlTagClosed(opening, tokens),
    metrics: estimateHtmlBlockMetrics(tokens),
  };
}

/**
 * Lezer does not consistently promote a standalone media element on one
 * physical line to HTMLBlock, especially when it follows paragraph text
 * without a blank line. Keep the product dialect deliberately narrow: only a
 * complete <img> or closed <video> root that owns the whole line gets block
 * media treatment. Other inline HTML remains under the normal Markdown parser,
 * and four-space-indented source remains an indented code block.
 */
function getStandaloneMediaHtmlBlock(
  state: EditorState,
  lineNumber: number,
): MarkdownHtmlBlock | null {
  const line = state.doc.line(lineNumber);
  const leadingWhitespace = line.text.match(/^[ \t]*/)?.[0] ?? "";
  if (leadingWhitespace.includes("\t") || leadingWhitespace.length > 3) return null;

  const trimmedSource = line.text.trim();
  if (!trimmedSource.startsWith("<")) return null;

  const sourceFrom = line.from + leadingWhitespace.length;
  const tokens = scanMarkdownHtmlTagTokens(trimmedSource, sourceFrom);
  const opening = tokens[0] ?? null;
  const closing = tokens.at(-1) ?? null;
  const sourceTo = sourceFrom + trimmedSource.length;
  const isCompleteImage = Boolean(
    opening
    && opening.tagName === "img"
    && !opening.closing
    && opening.selfClosing
    && opening.from === sourceFrom
    && opening.to === sourceTo
    && tokens.length === 1,
  );
  const isCompleteVideo = Boolean(
    opening
    && opening.tagName === "video"
    && !opening.closing
    && !opening.selfClosing
    && opening.from === sourceFrom
    && closing
    && closing.closing
    && closing.tagName === "video"
    && closing.to === sourceTo
    && isRootHtmlTagClosed(opening, tokens),
  );
  if (
    !opening
    || (!isCompleteImage && !isCompleteVideo)
  ) {
    return null;
  }

  return {
    from: line.from,
    to: line.to,
    nextLineNumber: line.number + 1,
    source: line.text,
    tagName: opening.tagName,
    closed: true,
    metrics: estimateHtmlBlockMetrics(tokens),
  };
}

function estimateHtmlBlockMetrics(
  tokens: readonly MarkdownHtmlTagToken[],
): MarkdownHtmlBlockMetrics {
  const stack: string[] = [];
  let nestingDepth = 0;
  let elementCount = 0;
  let assetCount = 0;

  for (const token of tokens) {
    if (token.closing) {
      const matchingIndex = stack.lastIndexOf(token.tagName);
      if (matchingIndex >= 0) stack.length = matchingIndex;
      continue;
    }

    elementCount += 1;
    if (
      token.tagName === "img"
      || token.tagName === "video"
      || token.tagName === "audio"
      || token.tagName === "source"
    ) {
      assetCount += 1;
    }
    if (token.selfClosing || MARKDOWN_HTML_VOID_TAGS.has(token.tagName)) continue;
    stack.push(token.tagName);
    nestingDepth = Math.max(nestingDepth, stack.length);
  }

  return {
    logicalItems: tokens.length,
    // Text nodes and sanitizer wrappers are bounded by the tag count but are
    // not represented as tokens. A 2x estimate keeps policy conservative
    // without constructing DOM merely to decide whether DOM is affordable.
    estimatedDomNodes: Math.max(1, elementCount * 2 + 1),
    nestingDepth,
    assetCount,
  };
}

function findHtmlBlockStartingOnLine(
  state: EditorState,
  lineFrom: number,
  lineTo: number,
): SyntaxNode | null {
  let match: SyntaxNode | null = null;

  syntaxTree(state).iterate({
    from: lineFrom,
    to: lineTo,
    enter(nodeRef) {
      const node = nodeRef.node;
      if (match || node.name !== "HTMLBlock") return !match;
      if (node.from < lineFrom || node.from > lineTo) return false;
      if (state.sliceDoc(lineFrom, node.from).trim() !== "") return false;
      match = node;
      return false;
    },
  });

  return match;
}

function isRootHtmlTagClosed(
  opening: MarkdownHtmlTagToken,
  tokens: readonly MarkdownHtmlTagToken[],
): boolean {
  if (opening.selfClosing || MARKDOWN_HTML_VOID_TAGS.has(opening.tagName)) return true;

  let balance = 0;
  for (const token of tokens) {
    if (token.tagName !== opening.tagName) continue;
    if (token.closing) balance -= 1;
    else if (!token.selfClosing) balance += 1;
  }
  return balance <= 0;
}
