import { useEffect, useRef, useState } from "react";
import type { DataPort, WorkspaceContentChange } from "../../core/types";
import { workspaceContentChangeMatchesResource } from "../../core/workspaceContentChange";

type ResourceLease = Readonly<{
  path: string;
  url: string;
  revoke: DataPort["revokeFileUrl"];
}>;

export type FileResourceLeaseState = Readonly<{
  fileUrl: string | null;
  fileUrlLoading: boolean;
  fileUrlError: string | null;
}>;

/**
 * Owns capability-URL acquisition and revocation independently from Viewer
 * components. Matching storage events acquire a new lease while the previous
 * URL remains usable; unrelated events do not disturb the mounted resource.
 */
export function useFileResourceLease({
  dataPort,
  enabled,
  path,
  refresh,
}: Readonly<{
  dataPort: DataPort;
  enabled: boolean;
  path: string | null;
  refresh?: WorkspaceContentChange;
}>): FileResourceLeaseState {
  const [lease, setLease] = useState<ResourceLease | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPath, setErrorPath] = useState<string | null>(null);
  const [reloadSequence, setReloadSequence] = useState(0);
  const lastRefreshSequenceRef = useRef(refresh?.sequence ?? null);

  useEffect(() => {
    if (!refresh || lastRefreshSequenceRef.current === refresh.sequence) return;
    const previousSequence = lastRefreshSequenceRef.current ?? Number.NEGATIVE_INFINITY;
    lastRefreshSequenceRef.current = refresh.sequence;
    if (workspaceContentChangeMatchesResource(refresh, path, previousSequence)) {
      setReloadSequence((current) => current + 1);
    }
  }, [path, refresh]);

  useEffect(() => {
    if (!enabled || !path || !dataPort.getFileUrl) {
      setLease(null);
      setLoading(false);
      setError(null);
      setErrorPath(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorPath(null);
    Promise.resolve(dataPort.getFileUrl(path))
      .then((url) => {
        if (cancelled) {
          void Promise.resolve(dataPort.revokeFileUrl?.(url)).catch(() => undefined);
          return;
        }
        setLease({ path, url, revoke: dataPort.revokeFileUrl });
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
          setErrorPath(path);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataPort, enabled, path, reloadSequence]);

  useEffect(() => () => {
    if (lease) void Promise.resolve(lease.revoke?.(lease.url)).catch(() => undefined);
  }, [lease]);

  const matchesPath = lease?.path === path;
  return {
    fileUrl: matchesPath ? lease.url : null,
    fileUrlLoading: Boolean(enabled && path && (!matchesPath || loading)),
    fileUrlError: errorPath === path ? error : null,
  };
}
