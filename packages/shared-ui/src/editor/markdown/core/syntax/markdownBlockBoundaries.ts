import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export type MarkdownMovableBlockKind = "root" | "list-item";

/**
 * Ephemeral structural identity for a movable Markdown block. These ranges are
 * valid only for the EditorState that produced them; they are never persisted
 * into the document.
 */
export type MarkdownMovableBlockRef = Readonly<{
  kind: MarkdownMovableBlockKind;
  from: number;
  to: number;
  parentFrom: number;
  parentTo: number;
  parentName: string;
  depth: number;
}>;

export type MarkdownMovableBlockGroup = Readonly<{
  blocks: readonly MarkdownMovableBlockRef[];
  sourceIndex: number;
}>;

const LIST_NODE_NAMES = new Set(["BulletList", "OrderedList"]);

export function getMarkdownMovableBlockAt(
  state: EditorState,
  position: number,
): MarkdownMovableBlockRef | null {
  if (state.doc.length === 0) return null;
  const clampedPosition = Math.max(0, Math.min(position, state.doc.length));
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(
    clampedPosition,
    clampedPosition === state.doc.length ? -1 : 1,
  );

  // The innermost list item wins, so a nested item moves with its descendants
  // but never leaves its current list container.
  for (let current: SyntaxNode | null = node; current; current = current.parent) {
    if (current.name !== "ListItem" || !current.parent || !LIST_NODE_NAMES.has(current.parent.name)) {
      continue;
    }
    if (!current.prevSibling && !current.nextSibling) return null;
    return createBlockRef(current, current.parent, "list-item");
  }

  while (node?.parent && node.parent.name !== "Document") node = node.parent;
  if (!node?.parent || node.parent.name !== "Document" || node.from === node.to) return null;
  if (!node.prevSibling && !node.nextSibling) return null;
  return createBlockRef(node, node.parent, "root");
}

export function getMarkdownMovableBlockGroup(
  state: EditorState,
  source: MarkdownMovableBlockRef,
): MarkdownMovableBlockGroup | null {
  const parent = findStructuralParent(state, source);
  if (!parent) return null;

  const blocks: MarkdownMovableBlockRef[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.from === child.to) continue;
    if (source.kind === "list-item" && child.name !== "ListItem") continue;
    blocks.push(createBlockRef(child, parent, source.kind));
  }

  const sourceIndex = blocks.findIndex((block) => sameMarkdownMovableBlock(block, source));
  return sourceIndex < 0 ? null : { blocks, sourceIndex };
}

export function sameMarkdownMovableBlock(
  left: MarkdownMovableBlockRef | null,
  right: MarkdownMovableBlockRef | null,
): boolean {
  return Boolean(
    left
    && right
    && left.kind === right.kind
    && left.from === right.from
    && left.to === right.to
    && left.parentFrom === right.parentFrom
    && left.parentTo === right.parentTo
    && left.parentName === right.parentName,
  );
}

function createBlockRef(
  node: SyntaxNode,
  parent: SyntaxNode,
  kind: MarkdownMovableBlockKind,
): MarkdownMovableBlockRef {
  return {
    kind,
    from: node.from,
    to: node.to,
    parentFrom: parent.from,
    parentTo: parent.to,
    parentName: parent.name,
    depth: kind === "list-item" ? countListDepth(parent) : 0,
  };
}

function countListDepth(parent: SyntaxNode): number {
  let depth = 0;
  for (let current: SyntaxNode | null = parent; current; current = current.parent) {
    if (LIST_NODE_NAMES.has(current.name)) depth += 1;
  }
  return depth;
}

function findStructuralParent(
  state: EditorState,
  source: MarkdownMovableBlockRef,
): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(
    Math.min(source.from, state.doc.length),
    1,
  );
  while (node) {
    if (
      node.name === source.parentName
      && node.from === source.parentFrom
      && node.to === source.parentTo
    ) {
      return node;
    }
    node = node.parent;
  }
  return null;
}
