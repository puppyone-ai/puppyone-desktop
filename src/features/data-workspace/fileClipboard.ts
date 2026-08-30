import {
  getDataResourceName,
  getDataResourceParent,
  isDataResourceDescendant,
  isSameDataResource,
  joinDataResourcePath,
  normalizeDataResourcePath,
  type DataNode,
} from "@puppyone/shared-ui";

export type FileClipboardMode = "copy" | "cut";

/**
 * A clipboard entry intentionally excludes loaded descendants. The operation
 * only needs the selected roots and retaining a hydrated tree would make the
 * clipboard stale (and unnecessarily large) as the explorer refreshes.
 */
export type FileClipboardNodeSnapshot = Readonly<Omit<DataNode, "children"> & {
  children: null;
}>;

export type FileClipboardState = Readonly<{
  workspaceKey: string;
  mode: FileClipboardMode;
  nodes: readonly FileClipboardNodeSnapshot[];
}>;

export type FilePasteTarget = Readonly<{
  workspaceKey: string;
  path: string | null;
}>;

/**
 * Creates an immutable-by-contract snapshot of the selected roots. A selected
 * child is removed whenever one of its selected folder ancestors is present.
 */
export function createFileClipboardState(
  workspaceKey: string,
  mode: FileClipboardMode,
  nodes: readonly DataNode[],
): FileClipboardState | null {
  const normalizedWorkspaceKey = workspaceKey.trim();
  if (!normalizedWorkspaceKey) return null;

  const topLevelNodes = collapseNestedNodes(nodes);
  if (topLevelNodes.length === 0) return null;

  return {
    workspaceKey: normalizedWorkspaceKey,
    mode,
    nodes: topLevelNodes.map((node) => ({
      ...node,
      children: null,
    })),
  };
}

/**
 * Keeps selection order while removing duplicates and nodes already represented
 * by a selected folder ancestor. Paths remain case-sensitive here so this
 * model also works on case-sensitive APFS and Linux; the filesystem layer is
 * the authority for platform-specific collisions.
 */
export function collapseNestedNodes<T extends Pick<DataNode, "path" | "type">>(
  nodes: readonly T[],
): T[] {
  const uniqueNodes: T[] = [];
  const seenPaths = new Set<string>();

  for (const node of nodes) {
    const pathKey = getDataPathComparisonKey(node.path);
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);
    uniqueNodes.push(node);
  }

  const selectedFolderPaths = uniqueNodes
    .filter((node) => node.type === "folder")
    .map((node) => normalizeDataPath(node.path));

  return uniqueNodes.filter((node) => {
    const nodePath = normalizeDataPath(node.path);
    return !selectedFolderPaths.some((folderPath) => (
      !isSameDataPath(folderPath, nodePath)
      && isDataPathDescendant(nodePath, folderPath)
    ));
  });
}

/**
 * Validates the destination shared by a paste operation. Cross-workspace
 * clipboard paths are rejected because they are relative to their source
 * workspace. A multi-item cut remains valid when at least one item will move;
 * entries already in the target directory can be skipped as no-ops by the
 * caller.
 */
export function isValidPasteTarget(
  clipboard: FileClipboardState | null,
  target: FilePasteTarget,
): boolean {
  if (!clipboard || clipboard.nodes.length === 0) return false;
  if (clipboard.workspaceKey !== target.workspaceKey) return false;

  const targetPath = normalizeDataPath(target.path);
  for (const node of clipboard.nodes) {
    if (node.type !== "folder") continue;
    const sourcePath = normalizeDataPath(node.path);
    if (isSameDataPath(targetPath, sourcePath) || isDataPathDescendant(targetPath, sourcePath)) {
      return false;
    }
  }

  if (clipboard.mode === "cut") {
    const everyEntryAlreadyInTarget = clipboard.nodes.every((node) => (
      isSameDataPath(getDataParentPath(node.path), targetPath)
    ));
    if (everyEntryAlreadyInTarget) return false;
  }

  return true;
}

/** Returns a canonical workspace-relative path, using null for the root. */
export function normalizeDataPath(path: string | null | undefined): string | null {
  return normalizeDataResourcePath(path);
}

export function joinDataPath(parentPath: string | null, name: string): string {
  return joinDataResourcePath(parentPath, name);
}

export function getDataParentPath(path: string | null): string | null {
  return getDataResourceParent(path);
}

export function getDataPathName(path: string | null): string {
  return getDataResourceName(path);
}

export function isSameDataPath(left: string | null, right: string | null): boolean {
  return isSameDataResource(left, right);
}

export function isDataPathDescendant(candidate: string | null, ancestor: string | null): boolean {
  return isDataResourceDescendant(candidate, ancestor);
}

function getDataPathComparisonKey(path: string | null | undefined): string {
  return normalizeDataPath(path) ?? "";
}
