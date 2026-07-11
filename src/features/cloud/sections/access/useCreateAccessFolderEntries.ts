import { useEffect, useMemo, useState } from "react";
import {
  listCloudDirectory,
  type DesktopCloudSession,
  type DesktopCloudTreeEntry,
} from "../../../../lib/cloudApi";
import {
  loadCloudCache,
  readCloudCache,
  type CloudCacheContext,
} from "../../cache/cloudCache";
import { normalizeAccessPath } from "./createAccessModel";

const FOLDER_CACHE_TTL_MS = 15_000;

export function useCreateAccessFolderEntries({
  projectId,
  cloudSession,
  apiBaseUrl,
  path,
  onCloudSessionChange,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  path: string;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
}) {
  const cacheContext = useMemo<CloudCacheContext>(() => ({
    session: cloudSession,
    projectId,
    revision: "mutable-latest",
    resource: "access-folder-entries",
    path: normalizeAccessPath(path),
  }), [cloudSession, path, projectId]);
  const cachedEntries = readCloudCache<DesktopCloudTreeEntry[]>(cacheContext);
  const [state, setState] = useState<{
    entries: DesktopCloudTreeEntry[];
    loading: boolean;
    error: string | null;
  }>({
    entries: cachedEntries ?? [],
    loading: !cachedEntries,
    error: null,
  });

  useEffect(() => {
    const cached = readCloudCache<DesktopCloudTreeEntry[]>(cacheContext);
    if (cached) {
      setState({ entries: cached, loading: false, error: null });
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    void loadCloudCache(
      cacheContext,
      () => listCloudDirectory(cloudSession, projectId, path, onCloudSessionChange, apiBaseUrl)
        .then((tree) => sortTreeEntries(tree.entries)),
      { ttlMs: FOLDER_CACHE_TTL_MS },
    )
      .then((entries) => {
        if (!cancelled) setState({ entries, loading: false, error: null });
      })
      .catch((loadError) => {
        if (!cancelled) {
          setState({
            entries: [],
            loading: false,
            error: loadError instanceof Error ? loadError.message : "Unable to load folder.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, cacheContext, cloudSession, onCloudSessionChange, path, projectId]);

  return state;
}

function sortTreeEntries(entries: DesktopCloudTreeEntry[]) {
  return [...entries].sort((left, right) => {
    const leftFolder = left.type === "folder";
    const rightFolder = right.type === "folder";
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
