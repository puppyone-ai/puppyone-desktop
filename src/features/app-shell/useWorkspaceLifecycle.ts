import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WorkbenchWorkspaceContext,
  createWorkbenchWorkspace,
  createWorkspaceFolder,
  type WorkbenchWorkspace,
  type Workspace,
} from "@puppyone/shared-ui";
import {
  forgetLastWorkspace,
  attachWorkspaceFolder,
  detachWorkspaceFolder,
  getInitialWorkspace,
  getRecentWorkspaces,
  hydrateRecentWorkspaces,
  removeRecentWorkspace,
  selectWorkspaceFolderToAttach,
} from "../../lib/localFiles";
import {
  cloneRepositoryTarget,
  createLocalProjectTarget,
  openDroppedWorkspaceTarget,
  openWorkspaceTarget,
  selectLocalProjectLocationTarget,
  selectLocalWorkspaceFolder,
} from "../../lib/workspaceOpening";
import type {
  WorkspaceCloneRepositoryRequest,
  WorkspaceCreateProjectRequest,
  WorkspaceOpenResult,
  WorkspaceProjectLocationGrant,
} from "../../types/electron";
import {
  getRecentWorkspaceItems,
  mergeWorkspaceLists,
} from "./workspaceHomeModel";
import type { RecentWorkspaceHomeItem } from "./workspaceHomeModel";

export type WorkspaceEntryKind = "restored" | "opened" | "created" | "cloned";

export function useWorkspaceLifecycle({
  multiRootWorkspacesEnabled,
  onWorkspaceActivated,
  onWorkspaceCleared,
  onWorkspaceOpenSettled,
}: {
  multiRootWorkspacesEnabled: boolean;
  onWorkspaceActivated: () => void;
  onWorkspaceCleared: () => void;
  onWorkspaceOpenSettled: () => void;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [recentWorkspaceItems, setRecentWorkspaceItems] = useState<RecentWorkspaceHomeItem[]>([]);
  const [workbenchWorkspace, setWorkbenchWorkspace] = useState<WorkbenchWorkspace | null>(null);
  const [restoringWorkspace, setRestoringWorkspace] = useState(true);
  const [restoreWorkspaceError, setRestoreWorkspaceError] = useState<string | null>(null);
  const [activeWorkspaceEntryKind, setActiveWorkspaceEntryKind] = useState<WorkspaceEntryKind>("restored");
  const recentWorkspaceRequestRef = useRef(0);
  const workbenchWorkspaceContextRef = useRef<WorkbenchWorkspaceContext | null>(null);

  // This experiment gates attachment affordances only. The active composition,
  // Resource URI identity, and persistence kernel must not change when the user
  // toggles it; restored multi-Folder windows remain intact and writable.
  const workspaceFolderAttachmentEnabled = multiRootWorkspacesEnabled;

  // The current product projects the first Folder exactly as before. The
  // underlying state is already the general zero/one/many Folder model.
  const workspace = useMemo(
    () => workbenchWorkspace?.folders[0]?.workspace ?? null,
    [workbenchWorkspace],
  );

  const activateWorkspaceComposition = useCallback((
    nextWorkspaces: readonly Workspace[],
    workbenchWorkspaceId?: string | null,
  ) => {
    if (nextWorkspaces.length === 0) return;
    setWorkspaces((current) => {
      const nextIds = new Set(nextWorkspaces.map((item) => item.id));
      return [...nextWorkspaces, ...current.filter((item) => !nextIds.has(item.id))];
    });
    const nextWorkbenchWorkspace = createWorkbenchWorkspace(nextWorkspaces, {
      ...(workbenchWorkspaceId ? { id: workbenchWorkspaceId } : {}),
    });
    workbenchWorkspaceContextRef.current = new WorkbenchWorkspaceContext(nextWorkbenchWorkspace);
    setWorkbenchWorkspace(nextWorkbenchWorkspace);
    setRestoreWorkspaceError(null);
    onWorkspaceActivated();
  }, [onWorkspaceActivated]);

  const activateWorkspace = useCallback((nextWorkspace: Workspace, workbenchWorkspaceId?: string | null) => {
    activateWorkspaceComposition([nextWorkspace], workbenchWorkspaceId);
  }, [activateWorkspaceComposition]);

  const reconcileWorkspaceComposition = useCallback(async (
    nextWorkspaces: readonly Workspace[],
    workbenchWorkspaceId: string,
  ) => {
    if (nextWorkspaces.length === 0) return;
    const nextFolders = nextWorkspaces.map((item, index) => createWorkspaceFolder(item, { index }));
    const context = workbenchWorkspaceContextRef.current;
    if (!context || context.getWorkspace().id !== workbenchWorkspaceId) {
      activateWorkspaceComposition(nextWorkspaces, workbenchWorkspaceId);
      return;
    }
    const nextWorkbenchWorkspace = await context.replaceFolders(nextFolders);
    setWorkspaces((current) => {
      const nextIds = new Set(nextWorkspaces.map((item) => item.id));
      return [...nextWorkspaces, ...current.filter((item) => !nextIds.has(item.id))];
    });
    setWorkbenchWorkspace(nextWorkbenchWorkspace);
    setRestoreWorkspaceError(null);
    onWorkspaceActivated();
  }, [activateWorkspaceComposition, onWorkspaceActivated]);

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

  const handleWorkspaceOpenResult = useCallback((
    result: WorkspaceOpenResult | null,
    entryKind: WorkspaceEntryKind = "opened",
  ) => {
    if (!result) return;
    if (result.status === "opened-current" && result.workspace) {
      setActiveWorkspaceEntryKind(entryKind);
      activateWorkspace(result.workspace, result.workspaceId);
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

  const addProject = useCallback(async () => {
    if (!workspaceFolderAttachmentEnabled) {
      onWorkspaceOpenSettled();
      return;
    }
    try {
      const result = await selectWorkspaceFolderToAttach();
      if (!result) {
        onWorkspaceOpenSettled();
        return;
      }
      if (result.status !== "focused-existing" && result.workspaces.length > 0) {
        await reconcileWorkspaceComposition(result.workspaces, result.workspaceId);
      } else {
        setRestoreWorkspaceError(null);
        onWorkspaceOpenSettled();
      }
      void refreshRecentWorkspaceList().catch((error) => {
        console.warn("Unable to refresh recent puppyone workspaces:", error);
      });
    } catch (error) {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
      onWorkspaceOpenSettled();
    }
  }, [
    workspaceFolderAttachmentEnabled,
    onWorkspaceOpenSettled,
    reconcileWorkspaceComposition,
    refreshRecentWorkspaceList,
  ]);

  const addExistingProject = useCallback(async (folderPath: string) => {
    if (!workspaceFolderAttachmentEnabled) {
      onWorkspaceOpenSettled();
      return;
    }
    try {
      const result = await attachWorkspaceFolder(folderPath);
      if (result.status !== "focused-existing" && result.workspaces.length > 0) {
        await reconcileWorkspaceComposition(result.workspaces, result.workspaceId);
      } else {
        setRestoreWorkspaceError(null);
        onWorkspaceOpenSettled();
      }
      void refreshRecentWorkspaceList().catch((error) => {
        console.warn("Unable to refresh recent puppyone workspaces:", error);
      });
    } catch (error) {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
      onWorkspaceOpenSettled();
    }
  }, [
    workspaceFolderAttachmentEnabled,
    onWorkspaceOpenSettled,
    reconcileWorkspaceComposition,
    refreshRecentWorkspaceList,
  ]);

  const removeProject = useCallback(async (folderPath: string) => {
    try {
      const result = await detachWorkspaceFolder(folderPath);
      if (result.workspaces.length > 0) {
        await reconcileWorkspaceComposition(result.workspaces, result.workspaceId);
      }
      setRestoreWorkspaceError(null);
      onWorkspaceOpenSettled();
    } catch (error) {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
      onWorkspaceOpenSettled();
    }
  }, [onWorkspaceOpenSettled, reconcileWorkspaceComposition]);

  const createProject = useCallback(async (request: WorkspaceCreateProjectRequest) => {
    const result = await createLocalProjectTarget(request);
    handleWorkspaceOpenResult(result, "created");
    return result !== null;
  }, [handleWorkspaceOpenResult]);

  const chooseProjectLocation = useCallback(async (): Promise<WorkspaceProjectLocationGrant | null> => {
    return selectLocalProjectLocationTarget();
  }, []);

  const cloneRepository = useCallback(async (request: WorkspaceCloneRepositoryRequest) => {
    const result = await cloneRepositoryTarget(request);
    handleWorkspaceOpenResult(result, "cloned");
    return result !== null;
  }, [handleWorkspaceOpenResult]);

  const removeWorkspaceFromRecents = useCallback(async (folderPath: string) => {
    await removeRecentWorkspace(folderPath);
    recentWorkspaceRequestRef.current += 1;
    setRecentWorkspaceItems((current) => current.filter((item) => item.workspace.path !== folderPath));
    setWorkspaces((current) => current.filter((item) => item.path !== folderPath));
  }, []);

  const clearWorkspace = useCallback(() => {
    workbenchWorkspaceContextRef.current = null;
    setActiveWorkspaceEntryKind("restored");
    setWorkbenchWorkspace(null);
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
    setWorkbenchWorkspace(null);
    workbenchWorkspaceContextRef.current = null;
    setActiveWorkspaceEntryKind("restored");
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
        const initialComposition = initialWorkspace.workspaces?.length
          ? initialWorkspace.workspaces
          : initialWorkspace.workspace ? [initialWorkspace.workspace] : [];
        if (initialComposition.length > 0) {
          activateWorkspaceComposition(initialComposition, initialWorkspace.workspaceId);
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
  }, [activateWorkspaceComposition]);

  return {
    addProject,
    addExistingProject,
    activeWorkspaceEntryKind,
    activateWorkspace,
    clearWorkspace,
    chooseProjectLocation,
    cloneRepository,
    createProject,
    forgetActiveWorkspace,
    handleWorkspaceOpenResult,
    openDroppedWorkspace,
    openFolder,
    openWorkspacePath,
    removeWorkspaceFromRecents,
    removeProject,
    recentWorkspaceItems,
    refreshRecentWorkspaceList,
    restoreWorkspaceError,
    restoringWorkspace,
    setRestoreWorkspaceError,
    setWorkspaces,
    workbenchWorkspace,
    workspace,
    workspaces,
  };
}
