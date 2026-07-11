import { useCallback, useEffect, useMemo, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  forgetLastWorkspace,
  getInitialWorkspace,
  getRecentWorkspaces,
  hydrateRecentWorkspaces,
} from "../../lib/localFiles";
import {
  openWorkspaceTarget,
  selectLocalWorkspaceFolder,
} from "../../lib/workspaceOpening";
import type { WorkspaceOpenResult } from "../../types/electron";
import {
  getRecentWorkspaceItems,
  mergeWorkspaceLists,
} from "./workspaceHomeModel";
import type { RecentWorkspaceHomeItem } from "../../components/MinimalOnboarding";

export function useWorkspaceLifecycle({
  onWorkspaceActivated,
  onWorkspaceCleared,
  onWorkspaceOpenSettled,
}: {
  onWorkspaceActivated: () => void;
  onWorkspaceCleared: () => void;
  onWorkspaceOpenSettled: () => void;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [recentWorkspaceItems, setRecentWorkspaceItems] = useState<RecentWorkspaceHomeItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [restoringWorkspace, setRestoringWorkspace] = useState(true);
  const [restoreWorkspaceError, setRestoreWorkspaceError] = useState<string | null>(null);

  const workspace = useMemo(
    () => activeWorkspaceId ? workspaces.find((item) => item.id === activeWorkspaceId) ?? null : null,
    [activeWorkspaceId, workspaces],
  );

  const activateWorkspace = useCallback((nextWorkspace: Workspace) => {
    setWorkspaces((current) => {
      const withoutExisting = current.filter((item) => item.id !== nextWorkspace.id);
      return [nextWorkspace, ...withoutExisting];
    });
    setActiveWorkspaceId(nextWorkspace.id);
    setRestoreWorkspaceError(null);
    onWorkspaceActivated();
  }, [onWorkspaceActivated]);

  const refreshRecentWorkspaceList = useCallback(async () => {
    const result = await getRecentWorkspaces();
    setRecentWorkspaceItems(getRecentWorkspaceItems(result));
    setWorkspaces((current) => mergeWorkspaceLists(current, result.workspaces));
    if (result.errors.length > 0) {
      console.warn("Some recent puppyone workspaces could not be loaded:", result.errors);
    }
    void hydrateRecentWorkspaces()
      .then((hydrated) => {
        setRecentWorkspaceItems(getRecentWorkspaceItems(hydrated));
        setWorkspaces((current) => mergeWorkspaceLists(current, hydrated.workspaces));
        if (hydrated.errors.length > 0) {
          console.warn("Some recent puppyone workspaces could not be hydrated:", hydrated.errors);
        }
      })
      .catch((error) => {
        console.warn("Unable to hydrate recent puppyone workspaces:", error);
      });
  }, []);

  const handleWorkspaceOpenResult = useCallback((result: WorkspaceOpenResult | null) => {
    if (!result) return;
    if (result.status === "opened-current" && result.workspace) {
      activateWorkspace(result.workspace);
    } else {
      setRestoreWorkspaceError(null);
      onWorkspaceOpenSettled();
    }
    void refreshRecentWorkspaceList().catch((error) => {
      console.warn("Unable to refresh recent puppyone workspaces:", error);
    });
  }, [activateWorkspace, onWorkspaceOpenSettled, refreshRecentWorkspaceList]);

  const openWorkspacePath = useCallback(async (folderPath: string) => {
    const result = await openWorkspaceTarget({
      kind: "local",
      path: folderPath,
      placement: "current-window",
    });
    handleWorkspaceOpenResult(result);
  }, [handleWorkspaceOpenResult]);

  const openFolder = useCallback(async () => {
    const result = await selectLocalWorkspaceFolder({
      placement: workspace ? "dedicated-window" : "current-window",
    });
    handleWorkspaceOpenResult(result);
  }, [handleWorkspaceOpenResult, workspace]);

  const clearWorkspace = useCallback(() => {
    setActiveWorkspaceId(null);
    onWorkspaceCleared();
  }, [onWorkspaceCleared]);

  const forgetActiveWorkspace = useCallback(async ({ workspaceIsCloud }: { workspaceIsCloud: boolean }) => {
    const currentWorkspaceId = workspace?.id ?? null;
    if (!workspaceIsCloud) {
      await forgetLastWorkspace();
    }
    if (currentWorkspaceId) {
      setWorkspaces((current) => current.filter((item) => item.id !== currentWorkspaceId));
      setRecentWorkspaceItems((current) => current.filter((item) => item.workspace.id !== currentWorkspaceId));
    }
    setActiveWorkspaceId(null);
    setRestoreWorkspaceError(null);
    setRestoringWorkspace(false);
    onWorkspaceCleared();
  }, [onWorkspaceCleared, workspace?.id]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getInitialWorkspace(), getRecentWorkspaces()])
      .then(([initialWorkspace, recentWorkspaces]) => {
        if (cancelled) return;
        setRecentWorkspaceItems(getRecentWorkspaceItems(recentWorkspaces));
        setWorkspaces((current) => mergeWorkspaceLists(current, recentWorkspaces.workspaces));
        if (recentWorkspaces.errors.length > 0) {
          console.warn("Some recent puppyone workspaces could not be loaded:", recentWorkspaces.errors);
        }
        if (initialWorkspace.workspace) {
          activateWorkspace(initialWorkspace.workspace);
        } else if (initialWorkspace.error) {
          setRestoreWorkspaceError(initialWorkspace.error);
        }
        void hydrateRecentWorkspaces()
          .then((hydrated) => {
            if (cancelled) return;
            setRecentWorkspaceItems(getRecentWorkspaceItems(hydrated));
            setWorkspaces((current) => mergeWorkspaceLists(current, hydrated.workspaces));
            if (hydrated.errors.length > 0) {
              console.warn("Some recent puppyone workspaces could not be hydrated:", hydrated.errors);
            }
          })
          .catch((error) => {
            if (!cancelled) console.warn("Unable to hydrate recent puppyone workspaces:", error);
          });
      })
      .catch((error) => {
        if (!cancelled) {
          setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setRestoringWorkspace(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activateWorkspace]);

  return {
    activateWorkspace,
    clearWorkspace,
    forgetActiveWorkspace,
    handleWorkspaceOpenResult,
    openFolder,
    openWorkspacePath,
    recentWorkspaceItems,
    refreshRecentWorkspaceList,
    restoreWorkspaceError,
    restoringWorkspace,
    setRestoreWorkspaceError,
    setWorkspaces,
    workspace,
    workspaces,
  };
}
