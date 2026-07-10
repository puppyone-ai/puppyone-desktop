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
  revoke(): void;
};

export type AssetUrlResolver = (
  documentPath: string,
  href: string,
  signal?: AbortSignal,
) => Promise<string | null>;

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
      const url = await resolveAssetUrl(request.sourcePath, request.href, request.signal);
      if (!url) return null;

      const id = `asset:${++sequence}`;
      const handle: AssetBrokerHandle = {
        id,
        url,
        mimeType: null,
        revoke() {
          handles.delete(id);
        },
      };
      handles.set(id, handle);
      return handle;
    },

    revokePrincipal(principal: CapabilityPrincipal) {
      for (const [id, handle] of handles) {
        if (
          handle.id &&
          principal.documentPath === requestDocumentPath(handle) &&
          principal.documentRevision
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

function requestDocumentPath(_handle: AssetBrokerHandle): string {
  return "";
}

export type AssetBroker = ReturnType<typeof createAssetBroker>;
