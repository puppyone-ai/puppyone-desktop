import { useEffect, useMemo, useState } from "react";
import {
  listCloudDirectory,
  type DesktopCloudSession,
  type DesktopCloudTreeEntry,
} from "../../../../lib/cloudApi";
import { normalizeAccessPath } from "./createAccessModel";

const FOLDER_CACHE_LIMIT = 240;

const folderCache = new Map<string, DesktopCloudTreeEntry[]>();
const folderRequests = new Map<string, Promise<DesktopCloudTreeEntry[]>>();

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
  const cacheKey = useMemo(() => getFolderCacheKey({
    projectId,
    cloudSession,
    apiBaseUrl,
    path,
  }), [apiBaseUrl, cloudSession, path, projectId]);
  const cachedEntries = folderCache.get(cacheKey);
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
    const cached = folderCache.get(cacheKey);
    if (cached) {
      setState({ entries: cached, loading: false, error: null });
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ entries: current.entries, loading: true, error: null }));

    const request = getFolderRequest(cacheKey, () => (
      listCloudDirectory(cloudSession, projectId, path, onCloudSessionChange, apiBaseUrl)
        .then((tree) => sortTreeEntries(tree.entries))
    ));

    request
      .then((entries) => {
        if (cancelled) return;
        setState({ entries, loading: false, error: null });
      })
      .catch((loadError) => {
        if (cancelled) return;
        setState({
          entries: [],
          loading: false,
          error: loadError instanceof Error ? loadError.message : "Unable to load folder.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, cacheKey, cloudSession, onCloudSessionChange, path, projectId]);

  return state;
}

function getFolderRequest(cacheKey: string, load: () => Promise<DesktopCloudTreeEntry[]>) {
  const existing = folderRequests.get(cacheKey);
  if (existing) return existing;

  const request = load()
    .then((entries) => {
      folderCache.set(cacheKey, entries);
      trimFolderCache();
      return entries;
    })
    .finally(() => {
      folderRequests.delete(cacheKey);
    });

  folderRequests.set(cacheKey, request);
  return request;
}

function getFolderCacheKey({
  projectId,
  cloudSession,
  apiBaseUrl,
  path,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  path: string;
}) {
  return [
    cloudSession.user_email,
    apiBaseUrl ?? cloudSession.api_base_url ?? "",
    projectId,
    normalizeAccessPath(path),
  ].join("\n");
}

function trimFolderCache() {
  while (folderCache.size > FOLDER_CACHE_LIMIT) {
    const oldestKey = folderCache.keys().next().value;
    if (!oldestKey) return;
    folderCache.delete(oldestKey);
  }
}

function sortTreeEntries(entries: DesktopCloudTreeEntry[]) {
  return [...entries].sort((left, right) => {
    const leftFolder = left.type === "folder";
    const rightFolder = right.type === "folder";
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
