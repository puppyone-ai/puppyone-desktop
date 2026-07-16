import { useEffect, useMemo, useState } from "react";
import {
  listCloudRoot,
  type DesktopCloudSession,
  type DesktopCloudTreeEntry,
} from "../../../lib/cloudApi";
import {
  loadCloudCache,
  readCloudCache,
  type CloudCacheContext,
} from "../cache/cloudCache";

const CLOUD_PROJECT_PREVIEW_LIMIT = 8;
const CLOUD_PROJECT_PREVIEW_TTL_MS = 30_000;
const CLOUD_PROJECT_PREVIEW_MAX_CONCURRENCY = 3;

type PreviewQueueEntry = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const previewQueue: PreviewQueueEntry[] = [];
let activePreviewRequests = 0;

type CloudProjectPreviewState = {
  entries: DesktopCloudTreeEntry[];
  loading: boolean;
  error: boolean;
};

export function useCloudProjectPreview({
  enabled = true,
  session,
  projectId,
  projectRevision,
  apiBaseUrl,
  onSessionChange,
}: {
  enabled?: boolean;
  session: DesktopCloudSession | null;
  projectId: string;
  projectRevision?: string | null;
  apiBaseUrl: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
}): CloudProjectPreviewState {
  const cacheContext = useMemo<CloudCacheContext | null>(() => enabled && session ? ({
    session,
    projectId,
    revision: projectRevision?.trim() || "mutable-latest",
    resource: "project-preview",
    path: "",
  }) : null, [enabled, projectId, projectRevision, session]);
  const cachedEntries = cacheContext
    ? readCloudCache<DesktopCloudTreeEntry[]>(cacheContext)
    : undefined;
  const [state, setState] = useState<CloudProjectPreviewState>({
    entries: cachedEntries ?? [],
    loading: Boolean(enabled && session && !cachedEntries),
    error: false,
  });

  useEffect(() => {
    if (!enabled || !session || !projectId || !cacheContext) {
      setState({ entries: [], loading: false, error: false });
      return undefined;
    }

    const cached = readCloudCache<DesktopCloudTreeEntry[]>(cacheContext);
    if (cached) {
      setState({ entries: cached, loading: false, error: false });
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: false }));
    void loadCloudCache(
      cacheContext,
      () => scheduleProjectPreview(() => listCloudRoot(
          session,
          projectId,
          (nextSession) => {
            if (nextSession) onSessionChange(nextSession);
          },
          apiBaseUrl,
        ).then((tree) => sortPreviewEntries(tree.entries).slice(0, CLOUD_PROJECT_PREVIEW_LIMIT))),
      { ttlMs: CLOUD_PROJECT_PREVIEW_TTL_MS },
    )
      .then((entries) => {
        if (!cancelled) setState({ entries, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            entries: [],
            loading: false,
            error: true,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, cacheContext, enabled, onSessionChange, projectId, session]);

  return state;
}

function scheduleProjectPreview<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    previewQueue.push({
      run,
      resolve: (value) => resolve(value as T),
      reject,
    });
    drainProjectPreviewQueue();
  });
}

function drainProjectPreviewQueue(): void {
  while (activePreviewRequests < CLOUD_PROJECT_PREVIEW_MAX_CONCURRENCY && previewQueue.length > 0) {
    const entry = previewQueue.shift();
    if (!entry) return;
    activePreviewRequests += 1;
    void entry.run()
      .then(entry.resolve, entry.reject)
      .finally(() => {
        activePreviewRequests -= 1;
        drainProjectPreviewQueue();
      });
  }
}

function sortPreviewEntries(entries: DesktopCloudTreeEntry[]) {
  return [...entries].sort((left, right) => {
    const leftFolder = left.type === "folder";
    const rightFolder = right.type === "folder";
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
