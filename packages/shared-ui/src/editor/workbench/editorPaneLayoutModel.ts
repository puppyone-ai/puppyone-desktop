import { rebaseResourcePath } from "../../core/resourcePath";

export type EditorSplitDirection = "horizontal" | "vertical";
export type EditorSplitPlacement = "first" | "second";

export type EditorPaneSplitOptions = Readonly<{
  editorId?: string | null;
  placement?: EditorSplitPlacement;
}>;

export type EditorPaneLayoutLeaf = Readonly<{
  kind: "pane";
  id: string;
  editorId: string | null;
}>;

export type EditorPaneLayoutSplit = Readonly<{
  kind: "split";
  id: string;
  direction: EditorSplitDirection;
  ratio: number;
  first: EditorPaneLayoutNode;
  second: EditorPaneLayoutNode;
}>;

export type EditorPaneLayoutNode = EditorPaneLayoutLeaf | EditorPaneLayoutSplit;

export type EditorPaneLayoutState = Readonly<{
  root: EditorPaneLayoutNode;
  activePaneId: string;
}>;

const DEFAULT_PANE_ID = "editor-pane-1";
export const EDITOR_SPLIT_RATIO_MIN = 0.15;
export const EDITOR_SPLIT_RATIO_MAX = 0.85;
const MAX_LAYOUT_DEPTH = 12;

export function createEditorPaneLayout(editorId: string | null = null): EditorPaneLayoutState {
  return freezeLayout(createPane(DEFAULT_PANE_ID, editorId), DEFAULT_PANE_ID);
}

export function getEditorPanes(state: EditorPaneLayoutState): readonly EditorPaneLayoutLeaf[] {
  return Object.freeze(collectPanes(state.root));
}

export function getActiveEditorPane(state: EditorPaneLayoutState): EditorPaneLayoutLeaf {
  return findPane(state.root, state.activePaneId) ?? collectPanes(state.root)[0]!;
}

export function activateEditorPane(
  state: EditorPaneLayoutState,
  paneId: string,
): EditorPaneLayoutState {
  if (paneId === state.activePaneId || !findPane(state.root, paneId)) return state;
  return freezeLayout(state.root, paneId);
}

export function assignEditorToPane(
  state: EditorPaneLayoutState,
  paneId: string,
  editorId: string | null,
): EditorPaneLayoutState {
  if (!findPane(state.root, paneId)) return state;
  const root = mapPanes(state.root, (pane) => (
    pane.id === paneId ? createPane(pane.id, editorId) : pane
  ));
  return freezeLayout(root, paneId);
}

export function assignEditorToActivePane(
  state: EditorPaneLayoutState,
  editorId: string | null,
): EditorPaneLayoutState {
  return assignEditorToPane(state, state.activePaneId, editorId);
}

export function splitEditorPane(
  state: EditorPaneLayoutState,
  paneId: string,
  direction: EditorSplitDirection,
  options: EditorPaneSplitOptions = {},
): EditorPaneLayoutState {
  const source = findPane(state.root, paneId);
  if (!source) return state;
  const paneIdNumber = nextNumericId(state.root, "editor-pane-");
  const splitIdNumber = nextNumericId(state.root, "editor-split-");
  const nextPaneId = `editor-pane-${paneIdNumber}`;
  const nextSplitId = `editor-split-${splitIdNumber}`;
  const nextPane = createPane(
    nextPaneId,
    Object.prototype.hasOwnProperty.call(options, "editorId") ? options.editorId ?? null : source.editorId,
  );
  const nextPaneFirst = options.placement === "first";
  const root = replaceNode(state.root, paneId, freezeNode({
    kind: "split",
    id: nextSplitId,
    direction,
    ratio: 0.5,
    first: nextPaneFirst ? nextPane : source,
    second: nextPaneFirst ? source : nextPane,
  }));
  return freezeLayout(root, nextPaneId);
}

export function moveEditorPane(
  state: EditorPaneLayoutState,
  sourcePaneId: string,
  targetPaneId: string,
  direction: EditorSplitDirection,
  placement: EditorSplitPlacement = "second",
): EditorPaneLayoutState {
  if (sourcePaneId === targetPaneId || state.root.kind === "pane") return state;
  const source = findPane(state.root, sourcePaneId);
  const target = findPane(state.root, targetPaneId);
  if (!source || !target) return state;

  const collapsed = collapsePane(state.root, sourcePaneId);
  if (!collapsed.removed || !findPane(collapsed.node, targetPaneId)) return state;
  const nextSplitId = `editor-split-${nextNumericId(state.root, "editor-split-")}`;
  const sourceFirst = placement === "first";
  const root = replaceNode(collapsed.node, targetPaneId, freezeNode({
    kind: "split",
    id: nextSplitId,
    direction,
    ratio: 0.5,
    first: sourceFirst ? source : target,
    second: sourceFirst ? target : source,
  }));
  return freezeLayout(root, sourcePaneId);
}

export function closeEditorPane(
  state: EditorPaneLayoutState,
  paneId: string,
): EditorPaneLayoutState {
  if (!findPane(state.root, paneId)) return state;
  if (state.root.kind === "pane") {
    return freezeLayout(createPane(state.root.id, null), state.root.id);
  }

  const collapsed = collapsePane(state.root, paneId);
  if (!collapsed.removed) return state;
  const remainingPanes = collectPanes(collapsed.node);
  const activePaneId = state.activePaneId === paneId
    ? remainingPanes[0]!.id
    : findPane(collapsed.node, state.activePaneId)?.id ?? remainingPanes[0]!.id;
  return freezeLayout(collapsed.node, activePaneId);
}

export function updateEditorSplitRatio(
  state: EditorPaneLayoutState,
  splitId: string,
  ratio: number,
): EditorPaneLayoutState {
  const nextRatio = clampEditorSplitRatio(ratio);
  let changed = false;
  const root = mapNodes(state.root, (node) => {
    if (node.kind !== "split" || node.id !== splitId || node.ratio === nextRatio) return node;
    changed = true;
    return freezeNode({ ...node, ratio: nextRatio });
  });
  return changed ? freezeLayout(root, state.activePaneId) : state;
}

export function removeEditorFromPanes(
  state: EditorPaneLayoutState,
  editorId: string,
  fallbackEditorId: string | null,
): EditorPaneLayoutState {
  let changed = false;
  const root = mapPanes(state.root, (pane) => {
    if (pane.editorId !== editorId) return pane;
    changed = true;
    return createPane(pane.id, fallbackEditorId);
  });
  return changed ? freezeLayout(root, state.activePaneId) : state;
}

export function rebaseEditorPaneResources(
  state: EditorPaneLayoutState,
  previousResource: string,
  nextResource: string,
): EditorPaneLayoutState {
  let changed = false;
  const root = mapPanes(state.root, (pane) => {
    if (!pane.editorId) return pane;
    const editorId = rebaseResourcePath(pane.editorId, previousResource, nextResource);
    if (editorId === pane.editorId) return pane;
    changed = true;
    return createPane(pane.id, editorId);
  });
  return changed ? freezeLayout(root, state.activePaneId) : state;
}

export function parseEditorPaneLayoutState(
  value: unknown,
  validEditorIds: ReadonlySet<string>,
  fallbackEditorId: string | null = null,
): EditorPaneLayoutState {
  if (!value || typeof value !== "object") return createEditorPaneLayout(fallbackEditorId);
  const candidate = value as Partial<EditorPaneLayoutState>;
  const seenIds = new Set<string>();
  const root = parseNode(candidate.root, validEditorIds, seenIds, 0);
  if (!root) return createEditorPaneLayout(fallbackEditorId);
  const panes = collectPanes(root);
  if (panes.length === 0) return createEditorPaneLayout(fallbackEditorId);
  const activePaneId = typeof candidate.activePaneId === "string"
    && panes.some(({ id }) => id === candidate.activePaneId)
    ? candidate.activePaneId
    : panes[0]!.id;
  return freezeLayout(root, activePaneId);
}

function parseNode(
  value: unknown,
  validEditorIds: ReadonlySet<string>,
  seenIds: Set<string>,
  depth: number,
): EditorPaneLayoutNode | null {
  if (!value || typeof value !== "object" || depth > MAX_LAYOUT_DEPTH) return null;
  const candidate = value as Partial<EditorPaneLayoutNode>;
  if (candidate.kind === "pane") {
    if (typeof candidate.id !== "string" || !candidate.id || seenIds.has(candidate.id)) return null;
    seenIds.add(candidate.id);
    const editorId = typeof candidate.editorId === "string" && validEditorIds.has(candidate.editorId)
      ? candidate.editorId
      : null;
    return createPane(candidate.id, editorId);
  }
  if (candidate.kind !== "split") return null;
  if (typeof candidate.id !== "string" || !candidate.id || seenIds.has(candidate.id)) return null;
  if (candidate.direction !== "horizontal" && candidate.direction !== "vertical") return null;
  seenIds.add(candidate.id);
  const first = parseNode(candidate.first, validEditorIds, seenIds, depth + 1);
  const second = parseNode(candidate.second, validEditorIds, seenIds, depth + 1);
  if (!first || !second) return null;
  return freezeNode({
    kind: "split",
    id: candidate.id,
    direction: candidate.direction,
    ratio: clampEditorSplitRatio(typeof candidate.ratio === "number" ? candidate.ratio : 0.5),
    first,
    second,
  });
}

function collapsePane(
  node: EditorPaneLayoutNode,
  paneId: string,
): { node: EditorPaneLayoutNode; removed: boolean } {
  if (node.kind === "pane") return { node, removed: false };
  if (node.first.kind === "pane" && node.first.id === paneId) {
    return { node: node.second, removed: true };
  }
  if (node.second.kind === "pane" && node.second.id === paneId) {
    return { node: node.first, removed: true };
  }
  const first = collapsePane(node.first, paneId);
  if (first.removed) return { node: freezeNode({ ...node, first: first.node }), removed: true };
  const second = collapsePane(node.second, paneId);
  if (second.removed) return { node: freezeNode({ ...node, second: second.node }), removed: true };
  return { node, removed: false };
}

function replaceNode(
  node: EditorPaneLayoutNode,
  nodeId: string,
  replacement: EditorPaneLayoutNode,
): EditorPaneLayoutNode {
  if (node.id === nodeId) return replacement;
  if (node.kind === "pane") return node;
  return freezeNode({
    ...node,
    first: replaceNode(node.first, nodeId, replacement),
    second: replaceNode(node.second, nodeId, replacement),
  });
}

function mapPanes(
  node: EditorPaneLayoutNode,
  map: (pane: EditorPaneLayoutLeaf) => EditorPaneLayoutLeaf,
): EditorPaneLayoutNode {
  if (node.kind === "pane") return map(node);
  return freezeNode({ ...node, first: mapPanes(node.first, map), second: mapPanes(node.second, map) });
}

function mapNodes(
  node: EditorPaneLayoutNode,
  map: (node: EditorPaneLayoutNode) => EditorPaneLayoutNode,
): EditorPaneLayoutNode {
  const mapped = node.kind === "pane"
    ? node
    : freezeNode({ ...node, first: mapNodes(node.first, map), second: mapNodes(node.second, map) });
  return map(mapped);
}

function collectPanes(node: EditorPaneLayoutNode): EditorPaneLayoutLeaf[] {
  return node.kind === "pane" ? [node] : [...collectPanes(node.first), ...collectPanes(node.second)];
}

function findPane(node: EditorPaneLayoutNode, paneId: string): EditorPaneLayoutLeaf | null {
  if (node.kind === "pane") return node.id === paneId ? node : null;
  return findPane(node.first, paneId) ?? findPane(node.second, paneId);
}

function nextNumericId(node: EditorPaneLayoutNode, prefix: string): number {
  const ids: string[] = [];
  visitNodes(node, (item) => ids.push(item.id));
  return ids.reduce((maximum, id) => {
    if (!id.startsWith(prefix)) return maximum;
    const numeric = Number(id.slice(prefix.length));
    return Number.isInteger(numeric) ? Math.max(maximum, numeric) : maximum;
  }, 0) + 1;
}

function visitNodes(node: EditorPaneLayoutNode, visit: (node: EditorPaneLayoutNode) => void) {
  visit(node);
  if (node.kind === "split") {
    visitNodes(node.first, visit);
    visitNodes(node.second, visit);
  }
}

function createPane(id: string, editorId: string | null): EditorPaneLayoutLeaf {
  return freezeNode({ kind: "pane", id, editorId });
}

function freezeNode<T extends EditorPaneLayoutNode>(node: T): T {
  return Object.freeze(node);
}

function freezeLayout(root: EditorPaneLayoutNode, activePaneId: string): EditorPaneLayoutState {
  return Object.freeze({ root, activePaneId });
}

export function clampEditorSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(
    EDITOR_SPLIT_RATIO_MAX,
    Math.max(EDITOR_SPLIT_RATIO_MIN, Math.round(ratio * 1_000) / 1_000),
  );
}
