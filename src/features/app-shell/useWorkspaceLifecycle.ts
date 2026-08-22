import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  forgetLastWorkspace,
  getInitialWorkspace,
  getRecentWorkspaces,
  hydrateRecentWorkspaces,
  removeRecentWorkspace,
} from "../../lib/localFiles";
import {
  cloneGitHubRepositoryTarget,
  createLocalProjectTarget,
  openDroppedWorkspaceTarget,
  openWorkspaceTarget,
  selectLocalWorkspaceFolder,
} from "../../lib/workspaceOpening";
import type {
  WorkspaceCloneRepositoryRequest,
  WorkspaceCreateProjectRequest,
  WorkspaceOpenResult,
} from "../../types/electron";
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
  const recentWorkspaceRequestRef = useRef(0);

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
    const requestId = recentWorkspaceRequestRef.current + 1;
    recentWorkspaceRequestRef.current = requestId;
    const result = await getRecentWorkspaces();
    if (recentWorkspaceRequestRef.current !== requestId) return;
    setRecentWorkspaceItems(getRecentWorkspaceItems(result));
    setWorkspaces((current) => mergeWorkspaceLists(current, result.workspaces));
    if (result.errors.length > 0) {
      console.warn("Some recent puppyone workspaces could not be loaded:", result.errors);
    }
    void hydrateRecentWorkspaces()
      .then((hydrated) => {
        if (recentWorkspaceRequestRef.current !== requestId) return;
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

  const openDroppedWorkspace = useCallback(async (folder: File) => {
    const result = await openDroppedWorkspaceTarget(folder);
    handleWorkspaceOpenResult(result);
  }, [handleWorkspaceOpenResult]);

  const openFolder = useCallback(async () => {
    const result = await selectLocalWorkspaceFolder({
      placement: workspace ? "dedicated-window" : "current-window",
    });
    handleWorkspaceOpenResult(result);
  }, [handleWorkspaceOpenResult, workspace]);

  const createProject = useCallback(async (request: WorkspaceCreateProjectRequest) => {
    const result = await createLocalProjectTarget(request);
    handleWorkspaceOpenResult(result);
    return result !== null;
  }, [handleWorkspaceOpenResult]);

  const cloneRepository = useCallback(async (request: WorkspaceCloneRepositoryRequest) => {
    const result = await cloneGitHubRepositoryTarget(request);
    handleWorkspaceOpenResult(result);
    return result !== null;
  }, [handleWorkspaceOpenResult]);

  const removeWorkspaceFromRecents = useCallback(async (folderPath: string) => {
    await removeRecentWorkspace(folderPath);
    recentWorkspaceRequestRef.current += 1;
    setRecentWorkspaceItems((current) => current.filter((item) => item.workspace.path !== folderPath));
    setWorkspaces((current) => current.filter((item) => item.path !== folderPath));
  }, []);

  const clearWorkspace = useCallback(() => {
    setActiveWorkspaceId(null);
    onWorkspaceCleared();
  }, [onWorkspaceCleared]);

  const forgetActiveWorkspace = useCallback(async () => {
    const currentWorkspaceId = workspace?.id ?? null;
    await forgetLastWorkspace();
    recentWorkspaceRequestRef.current += 1;
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
    const recentRequestId = recentWorkspaceRequestRef.current + 1;
    recentWorkspaceRequestRef.current = recentRequestId;

    Promise.all([getInitialWorkspace(), getRecentWorkspaces()])
      .then(([initialWorkspace, recentWorkspaces]) => {
        if (cancelled) return;
        if (recentWorkspaceRequestRef.current === recentRequestId) {
          setRecentWorkspaceItems(getRecentWorkspaceItems(recentWorkspaces));
          setWorkspaces((current) => mergeWorkspaceLists(current, recentWorkspaces.workspaces));
          if (recentWorkspaces.errors.length > 0) {
            console.warn("Some recent puppyone workspaces could not be loaded:", recentWorkspaces.errors);
          }
        }
        if (initialWorkspace.workspace) {
          activateWorkspace(initialWorkspace.workspace);
        } else if (initialWorkspace.error) {
          setRestoreWorkspaceError(initialWorkspace.error);
        }
        void hydrateRecentWorkspaces()
          .then((hydrated) => {
            if (cancelled || recentWorkspaceRequestRef.current !== recentRequestId) return;
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
    cloneRepository,
    createProject,
    forgetActiveWorkspace,
    handleWorkspaceOpenResult,
    openDroppedWorkspace,
    openFolder,
    openWorkspacePath,
    removeWorkspaceFromRecents,
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
