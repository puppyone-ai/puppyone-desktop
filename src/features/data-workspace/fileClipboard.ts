import type { DataNode } from "@puppyone/shared-ui";

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
  if (path === null || path === undefined) return null;
  const normalized = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
  return normalized || null;
}

export function joinDataPath(parentPath: string | null, name: string): string {
  const parent = normalizeDataPath(parentPath);
  const child = normalizeDataPath(name);
  if (!child) return parent ?? "";
  return parent ? `${parent}/${child}` : child;
}

export function getDataParentPath(path: string | null): string | null {
  const normalized = normalizeDataPath(path);
  if (!normalized) return null;
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex < 0 ? null : normalized.slice(0, slashIndex) || null;
}

export function getDataPathName(path: string | null): string {
  const normalized = normalizeDataPath(path);
  if (!normalized) return "";
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex < 0 ? normalized : normalized.slice(slashIndex + 1);
}

export function isSameDataPath(left: string | null, right: string | null): boolean {
  return getDataPathComparisonKey(left) === getDataPathComparisonKey(right);
}

export function isDataPathDescendant(candidate: string | null, ancestor: string | null): boolean {
  const candidateKey = getDataPathComparisonKey(candidate);
  const ancestorKey = getDataPathComparisonKey(ancestor);
  if (!candidateKey || candidateKey === ancestorKey) return false;
  if (!ancestorKey) return true;
  return candidateKey.startsWith(`${ancestorKey}/`);
}

function getDataPathComparisonKey(path: string | null | undefined): string {
  return normalizeDataPath(path) ?? "";
}
