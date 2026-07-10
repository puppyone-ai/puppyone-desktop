import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  parseMarkdownHtmlTagToken,
  type MarkdownHtmlAttribute,
  type MarkdownHtmlTagToken,
} from "./htmlTagTokenizer";

export type MarkdownInlineHtmlStatus = "complete" | "incomplete" | "malformed";

export type MarkdownInlineHtml = {
  kind: "inlineHtml";
  from: number;
  to: number;
  tagName: string;
  openingMarker: { from: number; to: number };
  contentRange: { from: number; to: number } | null;
  closingMarker: { from: number; to: number } | null;
  attributes: readonly MarkdownHtmlAttribute[];
  status: MarkdownInlineHtmlStatus;
  containerFrom: number;
  containerTo: number;
};

type InlineContainer = {
  from: number;
  to: number;
  tokens: MarkdownHtmlTagToken[];
};

type MarkdownInlineHtmlCacheEntry = {
  tree: ReturnType<typeof syntaxTree>;
  elements: readonly MarkdownInlineHtml[];
};

const markdownInlineHtmlCache = new WeakMap<object, MarkdownInlineHtmlCacheEntry>();

export function getMarkdownInlineHtml(state: EditorState): readonly MarkdownInlineHtml[] {
  const tree = syntaxTree(state);
  const cached = markdownInlineHtmlCache.get(state.doc);
  if (cached?.tree === tree) return cached.elements;

  const containers = collectInlineHtmlContainers(state, tree);
  const elements = Array.from(containers.values())
    .flatMap(pairInlineHtmlContainer)
    .sort(compareInlineHtmlElements);
  markdownInlineHtmlCache.set(state.doc, { tree, elements });
  return elements;
}

export function getMarkdownInlineHtmlInRange(
  state: EditorState,
  from: number,
  to: number,
): readonly MarkdownInlineHtml[] {
  const rangeFrom = Math.max(0, Math.min(from, to, state.doc.length));
  const rangeTo = Math.max(rangeFrom, Math.min(Math.max(from, to), state.doc.length));
  return getMarkdownInlineHtml(state).filter((element) => (
    element.from < rangeTo && element.to > rangeFrom
  ));
}

function collectInlineHtmlContainers(
  state: EditorState,
  tree: ReturnType<typeof syntaxTree>,
): Map<string, InlineContainer> {
  const containers = new Map<string, InlineContainer>();

  tree.iterate({
    enter(nodeRef) {
      const node = nodeRef.node;
      if (node.name !== "HTMLTag") return true;

      const containerNode = findInlineContainerNode(node);
      if (!containerNode) return false;

      const token = parseMarkdownHtmlTagToken(state.sliceDoc(node.from, node.to), node.from);
      if (!token) return false;

      const key = `${containerNode.from}:${containerNode.to}`;
      const container = containers.get(key) ?? {
        from: containerNode.from,
        to: containerNode.to,
        tokens: [],
      };
      container.tokens.push(token);
      containers.set(key, container);
      return false;
    },
  });

  for (const container of containers.values()) {
    container.tokens.sort((left, right) => left.from - right.from || left.to - right.to);
  }
  return containers;
}

function findInlineContainerNode(node: SyntaxNode): SyntaxNode | null {
  for (let current = node.parent; current; current = current.parent) {
    if (isInlineContainerName(current.name)) return current;
    if (current.name === "HTMLBlock" || current.name === "Document") break;
  }
  return null;
}

function isInlineContainerName(name: string): boolean {
  return (
    name === "Paragraph" ||
    /^ATXHeading[1-6]$/.test(name) ||
    /^SetextHeading[12]$/.test(name)
  );
}

function pairInlineHtmlContainer(container: InlineContainer): MarkdownInlineHtml[] {
  const elements: MarkdownInlineHtml[] = [];
  const stack: MarkdownHtmlTagToken[] = [];
  const invalidRanges: Array<{ from: number; to: number }> = [];

  for (const token of container.tokens) {
    if (token.selfClosing) {
      elements.push(createStandaloneElement(token, "complete", container));
      continue;
    }

    if (!token.closing) {
      stack.push(token);
      continue;
    }

    const opening = stack[stack.length - 1];
    if (!opening || opening.tagName !== token.tagName) {
      elements.push(createStandaloneElement(token, "malformed", container));
      invalidRanges.push({ from: token.from, to: token.to });
      continue;
    }

    stack.pop();
    elements.push({
      kind: "inlineHtml",
      from: opening.from,
      to: token.to,
      tagName: opening.tagName,
      openingMarker: { from: opening.from, to: opening.to },
      contentRange: { from: opening.to, to: token.from },
      closingMarker: { from: token.from, to: token.to },
      attributes: opening.attributes,
      status: "complete",
      containerFrom: container.from,
      containerTo: container.to,
    });
  }

  for (const opening of stack) {
    const invalidRange = { from: opening.from, to: container.to };
    invalidRanges.push(invalidRange);
    elements.push({
      kind: "inlineHtml",
      from: opening.from,
      to: container.to,
      tagName: opening.tagName,
      openingMarker: { from: opening.from, to: opening.to },
      contentRange: opening.to <= container.to ? { from: opening.to, to: container.to } : null,
      closingMarker: null,
      attributes: opening.attributes,
      status: "incomplete",
      containerFrom: container.from,
      containerTo: container.to,
    });
  }

  return elements.map((element) => {
    if (element.status !== "complete") return element;
    const enclosedByInvalidSource = invalidRanges.some((range) => (
      element.from >= range.from && element.to <= range.to
    ));
    return enclosedByInvalidSource ? { ...element, status: "malformed" } : element;
  });
}

function createStandaloneElement(
  token: MarkdownHtmlTagToken,
  status: MarkdownInlineHtmlStatus,
  container: InlineContainer,
): MarkdownInlineHtml {
  return {
    kind: "inlineHtml",
    from: token.from,
    to: token.to,
    tagName: token.tagName,
    openingMarker: { from: token.from, to: token.to },
    contentRange: null,
    closingMarker: null,
    attributes: token.attributes,
    status,
    containerFrom: container.from,
    containerTo: container.to,
  };
}

function compareInlineHtmlElements(left: MarkdownInlineHtml, right: MarkdownInlineHtml): number {
  return left.from - right.from || right.to - left.to || left.tagName.localeCompare(right.tagName);
}
