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

type CloudProjectPreviewState = {
  entries: DesktopCloudTreeEntry[];
  loading: boolean;
  error: string | null;
};

export function useCloudProjectPreview({
  session,
  projectId,
  projectRevision,
  apiBaseUrl,
  onSessionChange,
}: {
  session: DesktopCloudSession | null;
  projectId: string;
  projectRevision?: string | null;
  apiBaseUrl: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
}): CloudProjectPreviewState {
  const cacheContext = useMemo<CloudCacheContext | null>(() => session ? ({
    session,
    projectId,
    revision: projectRevision?.trim() || "mutable-latest",
    resource: "project-preview",
    path: "",
  }) : null, [projectId, projectRevision, session]);
  const cachedEntries = cacheContext
    ? readCloudCache<DesktopCloudTreeEntry[]>(cacheContext)
    : undefined;
  const [state, setState] = useState<CloudProjectPreviewState>({
    entries: cachedEntries ?? [],
    loading: Boolean(session && !cachedEntries),
    error: null,
  });

  useEffect(() => {
    if (!session || !projectId || !cacheContext) {
      setState({ entries: [], loading: false, error: null });
      return undefined;
    }

    const cached = readCloudCache<DesktopCloudTreeEntry[]>(cacheContext);
    if (cached) {
      setState({ entries: cached, loading: false, error: null });
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    void loadCloudCache(
      cacheContext,
      () => listCloudRoot(
        session,
        projectId,
        (nextSession) => {
          if (nextSession) onSessionChange(nextSession);
        },
        apiBaseUrl,
      ).then((tree) => sortPreviewEntries(tree.entries).slice(0, CLOUD_PROJECT_PREVIEW_LIMIT)),
      { ttlMs: CLOUD_PROJECT_PREVIEW_TTL_MS },
    )
      .then((entries) => {
        if (!cancelled) setState({ entries, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            entries: [],
            loading: false,
            error: error instanceof Error ? error.message : "Unable to load project preview.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, cacheContext, onSessionChange, projectId, session]);

  return state;
}

function sortPreviewEntries(entries: DesktopCloudTreeEntry[]) {
  return [...entries].sort((left, right) => {
    const leftFolder = left.type === "folder";
    const rightFolder = right.type === "folder";
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
