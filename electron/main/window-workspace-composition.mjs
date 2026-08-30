import { WindowWorkspaceState } from "./window-workspace-state.mjs";

/**
 * Main-process transaction boundary for adding one local Folder to a window's
 * ordered Workspace composition. Candidate discovery and persistence complete
 * before the authoritative WindowWorkspaceState snapshot is published.
 */
export function createWindowWorkspaceCompositionService({
  canonicalizeWorkspacePath,
  cleanupDetachedWorkspace = async () => undefined,
  getWindowState,
  getWorkspaceWindow,
  indexWorkspacePath,
  persistWorkspaceComposition,
  revealWindow,
  unindexWorkspacePath = () => undefined,
  workspaceFromPath,
}) {
  return Object.freeze({
    async attach(window, folderPath) {
      const workspace = await workspaceFromPath(folderPath);
      const canonicalPath = await canonicalizeWorkspacePath(workspace.path);
      const state = getWindowState(window);
      const currentWorkspaces = () => state.folders.map((folder) => folder.workspace);
      const existingWindow = getWorkspaceWindow(canonicalPath);

      if (existingWindow === window) {
        return createResult("already-attached", canonicalPath, workspace, currentWorkspaces());
      }
      if (existingWindow) {
        revealWindow(existingWindow);
        return createResult("focused-existing", canonicalPath, workspace, currentWorkspaces());
      }

      const nextFolders = [...state.folders, { path: canonicalPath, workspace }];
      // Validate path and stable Folder identity before durable state changes.
      const validationState = new WindowWorkspaceState();
      validationState.replaceFolders(nextFolders);
      await persistWorkspaceComposition(nextFolders.map((folder) => folder.workspace));

      state.replaceFolders(nextFolders);
      indexWorkspacePath(canonicalPath, window);
      return createResult("attached-current", canonicalPath, workspace, currentWorkspaces());
    },
    async detach(window, folderPath) {
      const canonicalPath = await canonicalizeWorkspacePath(folderPath);
      const state = getWindowState(window);
      const detachedFolder = state.folders.find((folder) => folder.path === canonicalPath);
      if (!detachedFolder) {
        return createResult("not-attached", canonicalPath, null, state.folders.map((folder) => folder.workspace));
      }
      if (state.folders.length <= 1) {
        throw new Error("The last Project cannot be removed from this Workspace. Go Home instead.");
      }

      const nextFolders = state.folders.filter((folder) => folder !== detachedFolder);
      await persistWorkspaceComposition(nextFolders.map((folder) => folder.workspace));
      state.replaceFolders(nextFolders);
      unindexWorkspacePath(canonicalPath, window);
      await cleanupDetachedWorkspace(window, detachedFolder);
      return createResult(
        "detached-current",
        canonicalPath,
        detachedFolder.workspace,
        nextFolders.map((folder) => folder.workspace),
      );
    },
  });
}

function createResult(status, folderPath, workspace, workspaces) {
  return Object.freeze({
    status,
    path: folderPath,
    workspace,
    workspaces: Object.freeze([...workspaces]),
  });
}
