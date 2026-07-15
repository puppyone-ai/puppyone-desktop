const { contextBridge, ipcRenderer, webUtils } = require("electron");
const externalViewerPacksEnabled = process.argv.includes("--puppyone-external-viewer-packs=1");

contextBridge.exposeInMainWorld("puppyoneDesktop", {
  getLocalizationBootstrap: () => ipcRenderer.invoke("localization:get-bootstrap"),
  setLanguagePreference: (preference) => (
    ipcRenderer.invoke("localization:set-language-preference", preference)
  ),
  onLocaleChanged: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("localization:changed", listener);
    return () => ipcRenderer.removeListener("localization:changed", listener);
  },
  onDocumentSessionFlushRequested: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = async (_event, payload) => {
      const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
      if (!requestId) return;
      try {
        await callback({ requestId });
        ipcRenderer.send("document-session:flush-result", { requestId, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ipcRenderer.send("document-session:flush-result", {
          requestId,
          ok: false,
          error: message.slice(0, 500),
        });
      }
    };
    ipcRenderer.on("document-session:flush-requested", listener);
    return () => ipcRenderer.removeListener("document-session:flush-requested", listener);
  },
  onDocumentSessionCloseCancelled: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => {
      const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
      if (requestId) callback({ requestId });
    };
    ipcRenderer.on("document-session:close-cancelled", listener);
    return () => ipcRenderer.removeListener("document-session:close-cancelled", listener);
  },
  readCloudSession: () => ipcRenderer.invoke("cloud-session:read"),
  readCloudAuthState: () => ipcRenderer.invoke("cloud-auth:read-state"),
  restoreCloudSession: (request) => ipcRenderer.invoke("cloud-session:restore", request),
  startCloudOAuth: (request) => ipcRenderer.invoke("cloud-session:start-oauth", request),
  clearCloudSession: () => ipcRenderer.invoke("cloud-session:clear"),
  onCloudSessionChanged: (callback) => {
    const listener = (_event, session) => callback(session);
    ipcRenderer.on("cloud-session:changed", listener);
    return () => ipcRenderer.removeListener("cloud-session:changed", listener);
  },
  onCloudAuthStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("cloud-auth:state", listener);
    return () => ipcRenderer.removeListener("cloud-auth:state", listener);
  },
  onCloudAuthError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("cloud-auth:error", listener);
    return () => ipcRenderer.removeListener("cloud-auth:error", listener);
  },
  requestCloudApi: (request) => ipcRenderer.invoke("cloud:api-request", request),
  requestCloudSessionApi: (request) => ipcRenderer.invoke("cloud:session-api-request", request),
  listCloudAccessPointDirectory: (request) => ipcRenderer.invoke("cloud:access-point-list-directory", request),
  getCloudAccessPointSemantics: (request) => ipcRenderer.invoke("cloud:access-point-semantics", request),
  openExternalUrl: (href) => ipcRenderer.invoke("system:open-external-url", href),
  markdownWebEmbed: {
    create: (request) => ipcRenderer.invoke("markdown-web-embed:create", request),
    setBounds: (request) => ipcRenderer.invoke("markdown-web-embed:set-bounds", request),
    destroy: (request) => ipcRenderer.invoke("markdown-web-embed:destroy", request),
  },
  setDockIcon: (iconId) => ipcRenderer.invoke("system:set-dock-icon", iconId),
  getInitialWorkspace: () => ipcRenderer.invoke("window:get-initial-workspace"),
  getLastWorkspace: () => ipcRenderer.invoke("workspace:get-last"),
  getRecentWorkspaces: () => ipcRenderer.invoke("workspace:get-recent"),
  hydrateRecentWorkspaces: () => ipcRenderer.invoke("workspace:hydrate-recent"),
  forgetLastWorkspace: () => ipcRenderer.invoke("workspace:forget-last"),
  showHomepage: () => ipcRenderer.invoke("workspace:show-homepage"),
  openWorkspaceInCurrentWindow: (folderPath) => ipcRenderer.invoke("workspace:open-current", folderPath),
  openWorkspaceInNewWindow: (folderPath) => ipcRenderer.invoke("workspace:open-new-window", folderPath),
  openCloudProjectInNewWindow: (request) => ipcRenderer.invoke("workspace:open-cloud-project-new-window", request),
  selectFolder: () => ipcRenderer.invoke("workspace:select-folder-current"),
  selectFolderInNewWindow: () => ipcRenderer.invoke("workspace:select-folder-new-window"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  listFolderChildren: (request) => ipcRenderer.invoke("workspace:list-folder-children", request),
  readFile: (request) => ipcRenderer.invoke("workspace:read-file", request),
  getFileUrl: (request) => ipcRenderer.invoke("workspace:get-file-url", request),
  revokeFileUrl: (request) => ipcRenderer.invoke("workspace:revoke-file-url", request),
  convertOfficeDocumentToDocx: (request) => ipcRenderer.invoke("workspace:convert-office-docx", request),
  cancelOfficeDocumentToDocxConversion: (request) => ipcRenderer.invoke("workspace:convert-office-docx-cancel", request),
  writeFile: (request) => ipcRenderer.invoke("workspace:write-file", request),
  createEntry: (request) => ipcRenderer.invoke("workspace:create-entry", request),
  renameEntry: (request) => ipcRenderer.invoke("workspace:rename-entry", request),
  moveEntry: (request) => ipcRenderer.invoke("workspace:move-entry", request),
  copyEntry: (request) => ipcRenderer.invoke("workspace:copy-entry", request),
  importEntries: (request) => {
    const files = Array.isArray(request?.files) ? request.files : [];
    const sourcePaths = files
      .map((file) => webUtils.getPathForFile(file))
      .filter((sourcePath) => typeof sourcePath === "string" && sourcePath.trim().length > 0);
    if (sourcePaths.length === 0) {
      return Promise.reject(new Error("No dropped files could be resolved."));
    }
    return ipcRenderer.invoke("workspace:import-entries", {
      rootPath: request?.rootPath,
      targetFolderPath: request?.targetFolderPath ?? null,
      sourcePaths,
    });
  },
  deleteEntry: (request) => ipcRenderer.invoke("workspace:delete-entry", request),
  revealEntryInFinder: (request) => ipcRenderer.invoke("workspace:reveal-entry-in-finder", request),
  openEntryExternal: (request) => ipcRenderer.invoke("workspace:open-entry-external", request),
  resolveExternalOpenTarget: (request) => ipcRenderer.invoke("workspace:resolve-external-open-target", request),
  listExternalOpenTargets: (request) => ipcRenderer.invoke("workspace:list-external-open-targets", request),
  chooseExternalApp: (request) => ipcRenderer.invoke("workspace:choose-external-app", request),
  startAppPreview: (request) => ipcRenderer.invoke("app-preview:start", request),
  restartAppPreview: (request) => ipcRenderer.invoke("app-preview:restart", request),
  stopAppPreview: (request) => ipcRenderer.invoke("app-preview:stop", request),
  getAppPreviewLogs: (request) => ipcRenderer.invoke("app-preview:get-logs", request),
  openAppPreviewExternal: (request) => ipcRenderer.invoke("app-preview:open-external", request),
  watchWorkspace: (rootPath, callback) => {
    const listener = (_event, payload) => {
      if (payload?.rootPath === rootPath) callback(payload);
    };
    ipcRenderer.on("workspace:changed", listener);
    let subscriptionId = null;
    let stopped = false;
    const ready = ipcRenderer.invoke("workspace:watch-start", { rootPath })
      .then((result) => {
        subscriptionId = result?.subscriptionId ?? null;
        // If teardown ran before start resolved, stop the now-known subscription.
        if (stopped && subscriptionId) {
          ipcRenderer.invoke("workspace:watch-stop", { subscriptionId }).catch(() => {});
        }
        return {
          subscriptionId,
          rootPath: result?.rootPath ?? rootPath,
        };
      })
      .catch((error) => {
        callback({
          rootPath,
          eventType: "error",
          path: null,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });
    const stop = () => {
      stopped = true;
      ipcRenderer.removeListener("workspace:changed", listener);
      if (subscriptionId) {
        ipcRenderer.invoke("workspace:watch-stop", { subscriptionId }).catch(() => {});
      }
    };
    return { stop, ready };
  },
  startGitRepositoryWatch: (request) => ipcRenderer.invoke("git-repository:watch-start", request),
  stopGitRepositoryWatch: (request) => ipcRenderer.invoke("git-repository:watch-stop", request),
  onGitRepositoryInvalidated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("git-repository:invalidated", listener);
    return () => ipcRenderer.removeListener("git-repository:invalidated", listener);
  },
  onGitRepositoryWindowFocus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("git-repository:window-focus", listener);
    return () => ipcRenderer.removeListener("git-repository:window-focus", listener);
  },
  getLatestAiEditReviewRequest: (request) => ipcRenderer.invoke("ai-edit-review:get-latest", request),
  onAiEditReviewUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("ai-edit-review:updated", listener);
    return () => ipcRenderer.removeListener("ai-edit-review:updated", listener);
  },
  getGitStatus: (request) => ipcRenderer.invoke("workspace:git-status", request),
  cancelGitStatus: (request) => ipcRenderer.invoke("workspace:git-status-cancel", request),
  getGitBranchGraph: (request) => ipcRenderer.invoke("workspace:git-branch-graph", request),
  cancelGitBranchGraph: (request) => ipcRenderer.invoke("workspace:git-branch-graph-cancel", request),
  initGitRepository: (request) => ipcRenderer.invoke("workspace:git-init", request),
  configureGitCloudRemote: (request) => ipcRenderer.invoke("workspace:git-configure-cloud-remote", request),
  removeGitRemote: (request) => ipcRenderer.invoke("workspace:git-remove-remote", request),
  readPuppyoneConfig: (request) => ipcRenderer.invoke("workspace:puppyone-config-read", request),
  writePuppyoneConfig: (request) => ipcRenderer.invoke("workspace:puppyone-config-write", request),
  getGitCommitDetail: (request) => ipcRenderer.invoke("workspace:git-commit-detail", request),
  getGitFileDiff: (request) => ipcRenderer.invoke("workspace:git-file-diff", request),
  cancelGitFileDiff: (request) => ipcRenderer.invoke("workspace:git-file-diff-cancel", request),
  readGitDiffResource: (request) => ipcRenderer.invoke("workspace:git-diff-resource-read", request),
  releaseGitDiffResources: (request) => ipcRenderer.invoke("workspace:git-diff-resource-release", request),
  stageGitPaths: (request) => ipcRenderer.invoke("workspace:git-stage", request),
  stageAllGitChanges: (request) => ipcRenderer.invoke("workspace:git-stage-all", request),
  unstageGitPaths: (request) => ipcRenderer.invoke("workspace:git-unstage", request),
  unstageAllGitChanges: (request) => ipcRenderer.invoke("workspace:git-unstage-all", request),
  discardGitPaths: (request) => ipcRenderer.invoke("workspace:git-discard", request),
  discardAllGitChanges: (request) => ipcRenderer.invoke("workspace:git-discard-all", request),
  commitGit: (request) => ipcRenderer.invoke("workspace:git-commit", request),
  checkoutGitBranch: (request) => ipcRenderer.invoke("workspace:git-checkout-branch", request),
  stashAndCheckoutGitBranch: (request) => ipcRenderer.invoke("workspace:git-stash-checkout-branch", request),
  commitAndCheckoutGitBranch: (request) => ipcRenderer.invoke("workspace:git-commit-checkout-branch", request),
  createGitBranch: (request) => ipcRenderer.invoke("workspace:git-create-branch", request),
  fetchGit: (request) => ipcRenderer.invoke("workspace:git-fetch", request),
  pullGit: (request) => ipcRenderer.invoke("workspace:git-pull", request),
  pushGit: (request) => ipcRenderer.invoke("workspace:git-push", request),
  publishGitBranch: (request) => ipcRenderer.invoke("workspace:git-publish-branch", request),
  syncGit: (request) => ipcRenderer.invoke("workspace:git-sync", request),
  getUpdateState: () => ipcRenderer.invoke("updates:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  updateNow: () => ipcRenderer.invoke("updates:update-now"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateStateChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
  discoverAgentProviders: (request) => ipcRenderer.invoke("agent:providers-discover", request),
  discoverLocalAgentConnections: (request) => ipcRenderer.invoke("agent:local-connections-discover", request),
  listAgentModels: (request) => ipcRenderer.invoke("agent:models-list", request),
  readAgentAccount: (request) => ipcRenderer.invoke("agent:account-read", request),
  createAgentSession: (request) => ipcRenderer.invoke("agent:session-create", request),
  resumeAgentSession: (request) => ipcRenderer.invoke("agent:session-resume", request),
  replayAgentSession: (request) => ipcRenderer.invoke("agent:session-replay", request),
  listAgentSessions: (request) => ipcRenderer.invoke("agent:sessions-list", request),
  forkAgentSession: (request) => ipcRenderer.invoke("agent:session-fork", request),
  archiveAgentSession: (request) => ipcRenderer.invoke("agent:session-archive", request),
  deleteAgentSession: (request) => ipcRenderer.invoke("agent:session-delete", request),
  closeAgentSession: (request) => ipcRenderer.invoke("agent:session-close", request),
  startAgentTurn: (request) => ipcRenderer.invoke("agent:turn-start", request),
  steerAgentTurn: (request) => ipcRenderer.invoke("agent:turn-steer", request),
  interruptAgentTurn: (request) => ipcRenderer.invoke("agent:turn-interrupt", request),
  compactAgentSession: (request) => ipcRenderer.invoke("agent:session-compact", request),
  resolveAgentApproval: (request) => ipcRenderer.invoke("agent:approval-resolve", request),
  resolveAgentQuestion: (request) => ipcRenderer.invoke("agent:question-resolve", request),
  onAgentEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:event", listener);
    return () => ipcRenderer.removeListener("agent:event", listener);
  },
  onAgentSessionExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:session-exit", listener);
    return () => ipcRenderer.removeListener("agent:session-exit", listener);
  },
  ...(externalViewerPacksEnabled ? {
    viewerPacks: {
      getSnapshot: () => ipcRenderer.invoke("viewer-pack:get-snapshot"),
      installLocal: () => ipcRenderer.invoke("viewer-pack:install-local"),
      disable: (request) => ipcRenderer.invoke("viewer-pack:disable", request),
      uninstall: (request) => ipcRenderer.invoke("viewer-pack:uninstall", request),
      activate: (request) => ipcRenderer.invoke("viewer-pack:activate", request),
      setBounds: (request) => ipcRenderer.invoke("viewer-pack:set-bounds", request),
      destroySession: (request) => ipcRenderer.invoke("viewer-pack:destroy-session", request),
      onSessionState: (callback) => {
        if (typeof callback !== "function") return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on("viewer-pack:session-state", listener);
        return () => ipcRenderer.removeListener("viewer-pack:session-state", listener);
      },
    },
  } : {}),
  createTerminal: (request) => ipcRenderer.invoke("terminal:create", request),
  writeTerminal: (request) => ipcRenderer.send("terminal:input", request),
  resizeTerminal: (request) => ipcRenderer.send("terminal:resize", request),
  closeTerminal: (id) => ipcRenderer.invoke("terminal:close", id),
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
  onTerminalExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:exit", listener);
    return () => ipcRenderer.removeListener("terminal:exit", listener);
  },
});
