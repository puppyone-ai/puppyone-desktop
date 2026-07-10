import type { CapabilityPrincipal } from "./capabilityPrincipal";

export type AssetBrokerRequest = {
  principal: CapabilityPrincipal;
  sourcePath: string;
  href: string;
  signal?: AbortSignal;
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

/**
 * Narrow asset capability broker. Workspace-relative non-executable assets are
 * part of the broad-safe profile, but adapters never receive raw file:// URLs.
 */
export function createAssetBroker(resolveAssetUrl: AssetUrlResolver | null) {
  const handles = new Map<string, AssetBrokerHandle>();
  let sequence = 0;

  return {
    async resolve(request: AssetBrokerRequest): Promise<AssetBrokerHandle | null> {
      if (!resolveAssetUrl) return null;
      if (request.signal?.aborted) return null;
      const resolved = await Promise.resolve(
        resolveAssetUrl(request.sourcePath, request.href, request.signal),
      );
      const url = resolved;
      if (!url || request.signal?.aborted) return null;
      // Never expose raw file:// to document content.
      if (url.startsWith("file:")) return null;

      const id = `asset:${++sequence}`;
      const handle: AssetBrokerHandle = {
        id,
        url,
        mimeType: null,
        principal: request.principal,
        revoke() {
          handles.delete(id);
        },
      };
      handles.set(id, handle);
      request.signal?.addEventListener("abort", () => handle.revoke(), { once: true });
      return handle;
    },

    revokePrincipal(principal: CapabilityPrincipal) {
      for (const [id, handle] of Array.from(handles.entries())) {
        if (
          handle.principal.editorViewId === principal.editorViewId &&
          handle.principal.documentPath === principal.documentPath &&
          handle.principal.purpose === principal.purpose
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
}

export type AssetBroker = ReturnType<typeof createAssetBroker>;
