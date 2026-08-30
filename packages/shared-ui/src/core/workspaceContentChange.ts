import type { WorkspaceContentChange } from "./types";
import { isDataResourceUri } from "./dataResourcePath";
import { canonicalizeResourcePath, looksLikeResourceUri } from "./resourcePath";
import {
  ResourceUriIdentityService,
  canonicalizeResourceUri,
  createWorkspaceResourceUri,
  type ResourceUri,
} from "./resourceUri";

const resourceIdentity = new ResourceUriIdentityService();

export type WorkspaceContentChangeInput = Readonly<{
  sequence: number;
  rootUri: ResourceUri | null;
  paths: readonly string[] | string | null;
}>;

/**
 * Validates an untrusted watcher/write notification before it can enter React
 * state. Malformed scoped input degrades to a root-scoped bulk invalidation;
 * it never becomes a render-time exception or silently aliases another root.
 */
export function createWorkspaceContentChange(
  input: WorkspaceContentChangeInput,
): WorkspaceContentChange {
  const sequence = Number.isSafeInteger(input.sequence) && input.sequence >= 0
    ? input.sequence
    : 0;
  const rootUri = normalizeRootUri(input.rootUri);
  if (input.rootUri && !rootUri) {
    return Object.freeze({ sequence, rootUri: null, paths: null });
  }
  if (input.paths === null) return Object.freeze({ sequence, rootUri, paths: null });

  const candidates = typeof input.paths === "string" ? [input.paths] : input.paths;
  try {
    const paths = Array.from(new Set(candidates.map((path) => {
      if (looksLikeResourceUri(path)) {
        throw new TypeError("Workspace change paths must be provider-relative.");
      }
      const canonicalPath = canonicalizeResourcePath(path);
      // Resolution validates traversal and segment safety at the same boundary
      // that owns the root identity. The returned path remains provider-local.
      if (rootUri) createWorkspaceResourceUri(rootUri, canonicalPath);
      return canonicalPath;
    })));
    return Object.freeze({ sequence, rootUri, paths: Object.freeze(paths) });
  } catch {
    return Object.freeze({ sequence, rootUri, paths: null });
  }
}

/**
 * Total, identity-aware invalidation predicate. This function is called from
 * hooks and React memo comparators, so malformed external input must never be
 * allowed to throw through the renderer.
 */
export function workspaceContentChangeMatchesResource(
  change: WorkspaceContentChange | null | undefined,
  resource: string | null,
): boolean {
  if (!change || !resource) return false;
  try {
    if (change.rootUri) {
      if (!isDataResourceUri(resource)) return false;
      const canonicalRoot = canonicalizeResourceUri(change.rootUri);
      if (!resourceIdentity.isEqualOrParent(resource, canonicalRoot)) return false;
      if (change.paths === null) return true;
      return change.paths.some((path) => (
        resourceIdentity.isEqual(
          createWorkspaceResourceUri(canonicalRoot, canonicalizeResourcePath(path)),
          resource,
        )
      ));
    }

    if (change.paths === null) return true;
    if (isDataResourceUri(resource) || looksLikeResourceUri(resource)) return false;
    const canonicalResource = canonicalizeResourcePath(resource);
    return change.paths.some((path) => {
      if (looksLikeResourceUri(path)) return false;
      return canonicalizeResourcePath(path) === canonicalResource;
    });
  } catch {
    return false;
  }
}

/** @deprecated Prefer workspaceContentChangeMatchesResource. */
export const workspaceContentChangeMatchesPath = workspaceContentChangeMatchesResource;

function normalizeRootUri(rootUri: ResourceUri | null): ResourceUri | null {
  if (!rootUri) return null;
  try {
    return canonicalizeResourceUri(rootUri);
  } catch {
    return null;
  }
}
