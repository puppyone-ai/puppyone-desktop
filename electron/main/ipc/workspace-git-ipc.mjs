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

export function registerWorkspaceGitIpcHandlers({ ipcMain, BrowserWindow, dialog }) {
  ipcMain.handle("workspace:git-status", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    return getWorkspaceGitStatus(rootPath);
  });

  ipcMain.handle("workspace:git-branch-graph", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    return getWorkspaceGitBranchGraph(rootPath);
  });

  ipcMain.handle("workspace:git-init", async (_event, request) => {
    return initializeWorkspaceGitRepository(requireWorkspaceRoot(request));
  });

  ipcMain.handle("workspace:git-configure-cloud-remote", async (_event, request) => {
    const rootPath = requireWorkspaceRoot(request);
    const remoteUrl = request?.remoteUrl;
    const remoteName = request?.remoteName ?? "puppyone";
    if (typeof remoteUrl !== "string" || remoteUrl.trim().length === 0) {
      throw new Error("Cloud remote URL is required.");
    }
    return configureWorkspaceCloudRemote(rootPath, remoteUrl, remoteName);
  });

  ipcMain.handle("workspace:puppyone-config-read", async (_event, request) => {
    return readPuppyoneWorkspaceConfig(requireWorkspaceRoot(request));
  });

  ipcMain.handle("workspace:puppyone-config-write", async (_event, request) => {
    return writePuppyoneWorkspaceConfig(requireWorkspaceRoot(request), request?.config);
  });

  ipcMain.handle("workspace:git-commit-detail", async (_event, request) => {
    const rootPath = request?.rootPath;
    const commitId = request?.commitId;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof commitId !== "string" || commitId.trim().length === 0) {
      throw new Error("Commit id is required.");
    }
    return getWorkspaceGitCommitDetail(rootPath, commitId);
  });

  ipcMain.handle("workspace:git-file-diff", async (_event, request) => {
    const rootPath = requireWorkspaceRoot(request);
    const filePath = request?.path;
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    return getWorkspaceGitFileDiff(rootPath, filePath, request?.scope);
  });

  ipcMain.handle("workspace:git-stage", async (_event, request) => {
    return stageWorkspaceGitPaths(requireWorkspaceRoot(request), request?.paths);
  });

  ipcMain.handle("workspace:git-stage-all", async (_event, request) => {
    return stageAllWorkspaceGitChanges(requireWorkspaceRoot(request));
  });

  ipcMain.handle("workspace:git-unstage", async (_event, request) => {
    return unstageWorkspaceGitPaths(requireWorkspaceRoot(request), request?.paths);
  });

  ipcMain.handle("workspace:git-unstage-all", async (_event, request) => {
    return unstageAllWorkspaceGitChanges(requireWorkspaceRoot(request));
  });

  ipcMain.handle("workspace:git-discard", async (_event, request) => {
    return discardWorkspaceGitPaths(requireWorkspaceRoot(request), request?.paths);
  });

  ipcMain.handle("workspace:git-discard-all", async (_event, request) => {
    return discardAllWorkspaceGitChanges(requireWorkspaceRoot(request));
  });

  ipcMain.handle("workspace:git-commit", async (_event, request) => {
    return commitWorkspaceGit(requireWorkspaceRoot(request), request?.message);
  });

  ipcMain.handle("workspace:git-checkout-branch", async (_event, request) => {
    return checkoutWorkspaceGitBranch(requireWorkspaceRoot(request), request?.branchName, {
      remote: Boolean(request?.remote),
    });
  });

  ipcMain.handle("workspace:git-stash-checkout-branch", async (_event, request) => {
    return stashAndCheckoutWorkspaceGitBranch(requireWorkspaceRoot(request), request?.branchName, {
      remote: Boolean(request?.remote),
    });
  });

  ipcMain.handle("workspace:git-commit-checkout-branch", async (_event, request) => {
    return commitAndCheckoutWorkspaceGitBranch(requireWorkspaceRoot(request), request?.branchName, {
      remote: Boolean(request?.remote),
    });
  });

  ipcMain.handle("workspace:git-create-branch", async (_event, request) => {
    return createWorkspaceGitBranch(requireWorkspaceRoot(request), request?.branchName);
  });

  ipcMain.handle("workspace:git-fetch", async (_event, request) => {
    return fetchWorkspaceGit(requireWorkspaceRoot(request));
  });

  ipcMain.handle("workspace:git-pull", async (event, request) => {
    return runWorkspaceGitIpcOperation({ BrowserWindow, dialog }, event, request, "pull", () => (
      pullWorkspaceGit(requireWorkspaceRoot(request))
    ));
  });

  ipcMain.handle("workspace:git-push", async (event, request) => {
    return runWorkspaceGitIpcOperation({ BrowserWindow, dialog }, event, request, "push", () => (
      pushWorkspaceGit(requireWorkspaceRoot(request))
    ));
  });

  ipcMain.handle("workspace:git-publish-branch", async (_event, request) => {
    return publishWorkspaceGitBranch(requireWorkspaceRoot(request), request?.remoteName);
  });

  ipcMain.handle("workspace:git-sync", async (_event, request) => {
    return syncWorkspaceGit(requireWorkspaceRoot(request));
  });
}

function requireWorkspaceRoot(request) {
  const rootPath = request?.rootPath;
  if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
    throw new Error("Workspace root path is required.");
  }
  return rootPath;
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
