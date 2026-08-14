import type { DataNode } from "@puppyone/shared-ui";

export type EditorNodeIndex = ReadonlyMap<string, DataNode>;

/** Builds one workspace-tree lookup per tree revision instead of walking the
 * complete Explorer tree once for every visible pane and render. */
export function createEditorNodeIndex(nodes: readonly DataNode[]): EditorNodeIndex {
  const index = new Map<string, DataNode>();
  const pending = [...nodes];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (!index.has(node.path)) index.set(node.path, node);
    if (node.children) pending.push(...node.children);
  }
  return index;
}
