import type { WorkspaceContentChange } from "./types";
import { canonicalizeResourcePath } from "./resourcePath";

export function workspaceContentChangeMatchesPath(
  change: WorkspaceContentChange | null | undefined,
  resourcePath: string | null,
): boolean {
  if (!change || !resourcePath) return false;
  if (change.paths === null) return true;
  const canonicalResource = canonicalizeResourcePath(resourcePath);
  return change.paths.some((path) => canonicalizeResourcePath(path) === canonicalResource);
}
