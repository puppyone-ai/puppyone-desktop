import type { CapabilityPrincipal } from "./capabilityPrincipal";
import {
  evaluateMarkdownAssetHref,
  isBrokerSafeResolvedAssetUrl,
  MARKDOWN_ASSET_MAX_IN_FLIGHT,
  type MarkdownAssetPolicyContext,
} from "../policy/markdownAssetPolicy";

export type AssetBrokerRequest = {
  principal: CapabilityPrincipal;
  sourcePath: string;
  href: string;
  signal?: AbortSignal;
  workspaceRoot?: string | null;
  allowRemoteHttp?: boolean;
};

export type AssetBrokerHandle = {
  id: string;
  url: string;
  mimeType: string | null;
  principal: CapabilityPrincipal;
  revoke(): void;
};

export type AssetUrlResolver = (
  documentPath: string,
  href: string,
  signal?: AbortSignal,
) => string | Promise<string | null> | null;

export type AssetBrokerOptions = {
  workspaceRoot?: string | null;
};

/**
 * Narrow asset capability broker. Workspace-relative non-executable assets are
 * part of the broad-safe profile, but adapters never receive raw file:// URLs.
 * Policy evaluation happens before any host resolver call.
 */
export function createAssetBroker(
  resolveAssetUrl: AssetUrlResolver | null,
  options: AssetBrokerOptions = {},
) {
  const handles = new Map<string, AssetBrokerHandle>();
  let sequence = 0;
  let inFlight = 0;
  const queue: Array<() => void> = [];
  const defaultWorkspaceRoot = options.workspaceRoot ?? null;

  const runExclusive = async <T>(task: () => Promise<T>): Promise<T | null> => {
    if (inFlight >= MARKDOWN_ASSET_MAX_IN_FLIGHT) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    inFlight += 1;
    try {
      return await task();
    } finally {
      inFlight -= 1;
      const next = queue.shift();
      next?.();
    }
  };

  return {
    async resolve(request: AssetBrokerRequest): Promise<AssetBrokerHandle | null> {
      if (request.signal?.aborted) return null;

      const policyContext: MarkdownAssetPolicyContext = {
        documentPath: request.sourcePath,
        workspaceRoot: request.workspaceRoot ?? defaultWorkspaceRoot,
        allowRemoteHttp: request.allowRemoteHttp === true,
      };
      const policy = evaluateMarkdownAssetHref(request.href, policyContext);
      if (!policy.ok) return null;

      if (policy.kind === "safe-direct" || policy.kind === "data-image") {
        return registerHandle(policy.url, policy.mimeType, request.principal);
      }

      if (!resolveAssetUrl) return null;

      return runExclusive(async () => {
        if (request.signal?.aborted) return null;
        const resolved = await Promise.resolve(
          resolveAssetUrl(request.sourcePath, request.href, request.signal),
        );
        if (!resolved || request.signal?.aborted) return null;
        if (!isBrokerSafeResolvedAssetUrl(resolved)) return null;
        return registerHandle(resolved, policy.mimeType, request.principal);
      });
    },

    revokePrincipal(principal: CapabilityPrincipal) {
      for (const [id, handle] of Array.from(handles.entries())) {
        if (samePrincipalScope(handle.principal, principal)) {
          handle.revoke();
          handles.delete(id);
        }
      }
    },

    revokeExecutionSession(executionSessionId: string) {
      for (const [id, handle] of Array.from(handles.entries())) {
        if (handle.principal.executionSessionId === executionSessionId) {
          handle.revoke();
          handles.delete(id);
        }
      }
    },

    revokeStaleRevision(editorViewId: string, currentRevision: string) {
      for (const [id, handle] of Array.from(handles.entries())) {
        if (
          handle.principal.editorViewId === editorViewId &&
          handle.principal.documentRevision !== currentRevision
        ) {
          handle.revoke();
          handles.delete(id);
        }
      }
    },

    disposeAll() {
      for (const handle of handles.values()) handle.revoke();
      handles.clear();
    },
  };

  function registerHandle(
    url: string,
    mimeType: string | null,
    principal: CapabilityPrincipal,
  ): AssetBrokerHandle {
    const id = `asset:${++sequence}`;
    const handle: AssetBrokerHandle = {
      id,
      url,
      mimeType,
      principal,
      revoke() {
        handles.delete(id);
      },
    };
    handles.set(id, handle);
    return handle;
  }
}

function samePrincipalScope(left: CapabilityPrincipal, right: CapabilityPrincipal): boolean {
  return (
    left.editorViewId === right.editorViewId &&
    left.workspaceId === right.workspaceId &&
    left.documentPath === right.documentPath &&
    left.purpose === right.purpose
  );
}

export type AssetBroker = ReturnType<typeof createAssetBroker>;
