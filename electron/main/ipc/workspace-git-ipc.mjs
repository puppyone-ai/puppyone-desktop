import {
  checkoutWorkspaceGitBranch,
  commitAndCheckoutWorkspaceGitBranch,
  commitWorkspaceGit,
  configureWorkspaceCloudRemote,
  createWorkspaceGitBranch,
  discardAllWorkspaceGitChanges,
  discardWorkspaceGitPaths,
  fetchWorkspaceGit,
  getWorkspaceGitBranchGraph,
  getWorkspaceGitCommitDetail,
  getWorkspaceGitFileDiff,
  getWorkspaceGitStatus,
  initializeWorkspaceGitRepository,
  pullWorkspaceGit,
  publishWorkspaceGitBranch,
  pushWorkspaceGit,
  readPuppyoneWorkspaceConfig,
  stageAllWorkspaceGitChanges,
  stageWorkspaceGitPaths,
  stashAndCheckoutWorkspaceGitBranch,
  syncWorkspaceGit,
  unstageAllWorkspaceGitChanges,
  unstageWorkspaceGitPaths,
  writePuppyoneWorkspaceConfig,
} from "../../../local-api/workspace.mjs";

export function registerWorkspaceGitIpcHandlers({
  ipcMain,
  BrowserWindow,
  dialog,
  authorizeWorkspaceRoot,
}) {
  const withAuthorizedRoot = (handler) => async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    return handler(rootPath, request, event);
  };

  ipcMain.handle("workspace:git-status", withAuthorizedRoot((rootPath) => (
    getWorkspaceGitStatus(rootPath)
  )));

  ipcMain.handle("workspace:git-branch-graph", withAuthorizedRoot((rootPath) => (
    getWorkspaceGitBranchGraph(rootPath)
  )));

  ipcMain.handle("workspace:git-init", withAuthorizedRoot((rootPath) => (
    initializeWorkspaceGitRepository(rootPath)
  )));

  ipcMain.handle("workspace:git-configure-cloud-remote", withAuthorizedRoot((rootPath, request) => {
    const remoteUrl = request?.remoteUrl;
    const remoteName = request?.remoteName ?? "puppyone";
    if (typeof remoteUrl !== "string" || remoteUrl.trim().length === 0) {
      throw new Error("Cloud remote URL is required.");
    }
    return configureWorkspaceCloudRemote(rootPath, remoteUrl, remoteName);
  }));

  ipcMain.handle("workspace:puppyone-config-read", withAuthorizedRoot((rootPath) => (
    readPuppyoneWorkspaceConfig(rootPath)
  )));

  ipcMain.handle("workspace:puppyone-config-write", withAuthorizedRoot((rootPath, request) => (
    writePuppyoneWorkspaceConfig(rootPath, request?.config)
  )));

  ipcMain.handle("workspace:git-commit-detail", withAuthorizedRoot((rootPath, request) => {
    const commitId = request?.commitId;
    if (typeof commitId !== "string" || commitId.trim().length === 0) {
      throw new Error("Commit id is required.");
    }
    return getWorkspaceGitCommitDetail(rootPath, commitId);
  }));

  ipcMain.handle("workspace:git-file-diff", withAuthorizedRoot((rootPath, request) => {
    const filePath = request?.path;
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    return getWorkspaceGitFileDiff(rootPath, filePath, request?.scope);
  }));

  ipcMain.handle("workspace:git-stage", withAuthorizedRoot((rootPath, request) => (
    stageWorkspaceGitPaths(rootPath, request?.paths)
  )));

  ipcMain.handle("workspace:git-stage-all", withAuthorizedRoot((rootPath) => (
    stageAllWorkspaceGitChanges(rootPath)
  )));

  ipcMain.handle("workspace:git-unstage", withAuthorizedRoot((rootPath, request) => (
    unstageWorkspaceGitPaths(rootPath, request?.paths)
  )));

  ipcMain.handle("workspace:git-unstage-all", withAuthorizedRoot((rootPath) => (
    unstageAllWorkspaceGitChanges(rootPath)
  )));

  ipcMain.handle("workspace:git-discard", withAuthorizedRoot((rootPath, request) => (
    discardWorkspaceGitPaths(rootPath, request?.paths)
  )));

  ipcMain.handle("workspace:git-discard-all", withAuthorizedRoot((rootPath) => (
    discardAllWorkspaceGitChanges(rootPath)
  )));

  ipcMain.handle("workspace:git-commit", withAuthorizedRoot((rootPath, request) => (
    commitWorkspaceGit(rootPath, request?.message)
  )));

  ipcMain.handle("workspace:git-checkout-branch", withAuthorizedRoot((rootPath, request) => (
    checkoutWorkspaceGitBranch(rootPath, request?.branchName, {
      remote: Boolean(request?.remote),
    })
  )));

  ipcMain.handle("workspace:git-stash-checkout-branch", withAuthorizedRoot((rootPath, request) => (
    stashAndCheckoutWorkspaceGitBranch(rootPath, request?.branchName, {
      remote: Boolean(request?.remote),
    })
  )));

  ipcMain.handle("workspace:git-commit-checkout-branch", withAuthorizedRoot((rootPath, request) => (
    commitAndCheckoutWorkspaceGitBranch(rootPath, request?.branchName, {
      remote: Boolean(request?.remote),
    })
  )));

  ipcMain.handle("workspace:git-create-branch", withAuthorizedRoot((rootPath, request) => (
    createWorkspaceGitBranch(rootPath, request?.branchName)
  )));

  ipcMain.handle("workspace:git-fetch", withAuthorizedRoot((rootPath) => (
    fetchWorkspaceGit(rootPath)
  )));

  ipcMain.handle("workspace:git-pull", withAuthorizedRoot((rootPath, request, event) => (
    runWorkspaceGitIpcOperation({ BrowserWindow, dialog }, event, request, "pull", () => (
      pullWorkspaceGit(rootPath)
    ))
  )));

  ipcMain.handle("workspace:git-push", withAuthorizedRoot((rootPath, request, event) => (
    runWorkspaceGitIpcOperation({ BrowserWindow, dialog }, event, request, "push", () => (
      pushWorkspaceGit(rootPath)
    ))
  )));

  ipcMain.handle("workspace:git-publish-branch", withAuthorizedRoot((rootPath, request) => (
    publishWorkspaceGitBranch(rootPath, request?.remoteName)
  )));

  ipcMain.handle("workspace:git-sync", withAuthorizedRoot((rootPath) => (
    syncWorkspaceGit(rootPath)
  )));
}

async function runWorkspaceGitIpcOperation(electron, event, request, operation, handler) {
  try {
    return await handler();
  } catch (error) {
    if (request?.showNativeErrorDialog === true) {
      void showWorkspaceGitErrorDialog(electron, event.sender, operation, error);
    }
    throw error;
  }
}

async function showWorkspaceGitErrorDialog({ BrowserWindow, dialog }, sender, operation, error) {
  const owner = BrowserWindow.fromWebContents(sender);
  const detail = error instanceof Error ? error.message : String(error);
  const operationLabel = operation === "pull" ? "Pull" : operation === "push" ? "Push" : "Git Operation";
  const message = operation === "pull"
    ? "Cannot pull remote changes."
    : operation === "push"
      ? "Cannot push local commits."
      : "Git operation failed.";

  try {
    const options = {
      type: "error",
      buttons: ["OK"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: `${operationLabel} Failed`,
      message,
      detail: detail.trim() || "No Git error output was captured.",
    };
    if (owner && !owner.isDestroyed()) {
      await dialog.showMessageBox(owner, options);
    } else {
      await dialog.showMessageBox(options);
    }
  } catch (dialogError) {
    console.warn("Unable to show Git operation error dialog:", dialogError);
  }
}
