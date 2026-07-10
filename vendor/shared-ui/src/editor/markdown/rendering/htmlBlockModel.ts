import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  MARKDOWN_HTML_VOID_TAGS,
  scanMarkdownHtmlTagTokens,
  type MarkdownHtmlTagToken,
} from "../semantic/htmlTagTokenizer";

export type MarkdownHtmlBlock = {
  from: number;
  to: number;
  nextLineNumber: number;
  source: string;
  tagName: string;
  closed: boolean;
};

export function getMarkdownHtmlBlock(state: EditorState, lineNumber: number): MarkdownHtmlBlock | null {
  const doc = state.doc;
  const firstLine = doc.line(lineNumber);
  const blockNode = findHtmlBlockStartingOnLine(state, firstLine.from, firstLine.to);
  if (!blockNode) return null;

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
