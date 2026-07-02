import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from "electron";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pty from "node-pty";
import {
  checkoutWorkspaceGitBranch,
  commitAndCheckoutWorkspaceGitBranch,
  commitWorkspaceGit,
  configureWorkspaceCloudRemote,
  createWorkspaceEntry,
  createWorkspaceGitBranch,
  deleteWorkspaceEntry,
  discardAllWorkspaceGitChanges,
  discardWorkspaceGitPaths,
  fetchWorkspaceGit,
  getWorkspaceGitFileDiff,
  getWorkspaceGitBranchGraph,
  getWorkspaceGitCommitDetail,
  getWorkspaceGitStatus,
  getMimeType,
  importWorkspaceEntries,
  initializeWorkspaceGitRepository,
  listFolderChildren,
  moveWorkspaceEntry,
  pullWorkspaceGit,
  publishWorkspaceGitBranch,
  pushWorkspaceGit,
  readPuppyoneWorkspaceConfig,
  readWorkspaceTextFile,
  readWorkspaceFile,
  renameWorkspaceEntry,
  resolveWorkspacePath as resolveLocalWorkspacePath,
  stageAllWorkspaceGitChanges,
  stageWorkspaceGitPaths,
  stashAndCheckoutWorkspaceGitBranch,
  syncWorkspaceGit,
  unstageAllWorkspaceGitChanges,
  unstageWorkspaceGitPaths,
  writePuppyoneWorkspaceConfig,
  writeWorkspaceTextFile,
  workspaceFromPath,
} from "../local-api/workspace.mjs";
import {
  WORKSPACE_EDIT_REVIEW_FLUSH_DELAY_MS,
  absorbWorkspaceEditReviewPath,
  disposeWorkspaceEditReview,
  flushWorkspaceEditReviewChanges,
  getLatestWorkspaceEditReviewRequest,
  initializeWorkspaceEditReview,
  noteWorkspaceEditReviewPath,
} from "../local-api/edit-review.mjs";
import { createUpdateService } from "./update-service.mjs";
import {
  cloudApiBaseUrlFromRemote,
  normalizeCloudApiBaseUrl,
} from "../shared/cloudEndpoint.js";
import { createCloudAuthService } from "./cloud-auth-service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const rendererDistPath = path.join(projectRoot, "dist", "index.html");
const appName = "puppyone";
const appIconPath = resolveAppIconPath();
const devServerUrl = process.env.PUPPYONE_DESKTOP_DEV_URL;
const workspaceStateFilename = "desktop-workspace-state.json";
const cloudAuthProtocol = "puppyone";
const macTitlebarOptions = process.platform === "darwin"
  ? {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 13, y: 12 },
    }
  : {
      titleBarStyle: "default",
    };

protocol.registerSchemesAsPrivileged([
  {
    scheme: "puppyone-local",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let updateService = null;
const windowsById = new Map();
const windowStateById = new Map();
const workspaceWindowByPath = new Map();
const terminalSessions = new Map();
const workspaceWatchers = new Map();
let lastFocusedWindowId = null;
const cloudAuthService = createCloudAuthService({
  app,
  projectRoot,
  protocol: cloudAuthProtocol,
  requestCloudApi,
  getCloudApiErrorMessage,
  getWindows: () => BrowserWindow.getAllWindows(),
  revealWindow: revealLastFocusedWindow,
});

app.setName(appName);
if (process.platform === "win32") {
  app.setAppUserModelId("ai.puppyone.desktop");
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit(0);
}

async function createWindow(options = {}) {
  const initialWorkspacePath = typeof options.initialWorkspacePath === "string"
    ? path.resolve(options.initialWorkspacePath)
    : null;
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 920,
    minHeight: 640,
    center: true,
    show: false,
    title: appName,
    ...(appIconPath ? { icon: appIconPath } : {}),
    backgroundColor: "#f1eadf",
    ...macTitlebarOptions,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });
  const webContentsId = window.webContents.id;
  windowsById.set(webContentsId, window);
  windowStateById.set(webContentsId, {
    initialWorkspacePath,
    workspacePath: null,
    lastFocusedAt: Date.now(),
  });
  lastFocusedWindowId = webContentsId;

  window.on("focus", () => {
    lastFocusedWindowId = webContentsId;
    const state = windowStateById.get(webContentsId);
    if (state) state.lastFocusedAt = Date.now();
  });

  window.once("ready-to-show", () => {
    revealWindow(window);
  });

  window.webContents.once("did-finish-load", () => {
    revealWindow(window);
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("puppyone renderer failed to load:", {
      errorCode,
      errorDescription,
      validatedURL,
    });
    revealWindow(window);
  });

  try {
    if (devServerUrl) {
      await window.loadURL(devServerUrl);
      window.webContents.openDevTools({ mode: "detach" });
    } else {
      await window.loadFile(rendererDistPath);
    }
  } catch (error) {
    console.error("puppyone failed to open renderer:", error);
    revealWindow(window);
  }

  revealWindow(window);

  window.on("closed", () => {
    releaseWindowWorkspaceById(webContentsId, window);
    closeTerminalSessionsForWindow(webContentsId);
    stopWorkspaceWatchesForWindow(webContentsId);
    windowsById.delete(webContentsId);
    windowStateById.delete(webContentsId);
    if (lastFocusedWindowId === webContentsId) {
      lastFocusedWindowId = getLastFocusedWindow()?.webContents.id ?? null;
    }
  });

  return window;
}

function revealWindow(window) {
  if (!window || window.isDestroyed()) return;
  const wasVisible = window.isVisible();
  if (window.isMinimized()) {
    window.restore();
  }
  if (!wasVisible) {
    window.show();
    window.center();
  }
  window.focus();
  lastFocusedWindowId = window.webContents.id;
  const state = windowStateById.get(window.webContents.id);
  if (state) state.lastFocusedAt = Date.now();
  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }
}

function revealLastFocusedWindow() {
  const window = getLastFocusedWindow();
  if (window) {
    revealWindow(window);
    return;
  }
  void createWindow();
}

function createOrRevealWindow() {
  revealLastFocusedWindow();
}

function getLastFocusedWindow() {
  const directWindow = lastFocusedWindowId ? windowsById.get(lastFocusedWindowId) : null;
  if (directWindow && !directWindow.isDestroyed()) return directWindow;

  let bestWindow = null;
  let bestFocusedAt = -1;
  for (const [id, window] of windowsById.entries()) {
    if (window.isDestroyed()) continue;
    const focusedAt = windowStateById.get(id)?.lastFocusedAt ?? 0;
    if (focusedAt > bestFocusedAt) {
      bestFocusedAt = focusedAt;
      bestWindow = window;
    }
  }
  return bestWindow;
}

function resolveAppIconPath() {
  const candidates = [
    path.join(projectRoot, "dist", "logo-square.png"),
    path.join(projectRoot, "public", "logo-square.png"),
    path.join(process.resourcesPath ?? projectRoot, "icon.icns"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function setDockIcon() {
  if (!appIconPath) return;
  try {
    app.dock.setIcon(appIconPath);
  } catch (error) {
    console.warn("Unable to set puppyone dock icon:", error);
  }
}

function setDockMenu() {
  if (process.platform !== "darwin" || !app.dock) return;

  const dockMenu = Menu.buildFromTemplate([
    {
      label: "New Window",
      click: () => {
        void createWindow();
      },
    },
  ]);

  app.dock.setMenu(dockMenu);
}

function registerCloudAuthProtocol() {
  cloudAuthService.registerProtocol();
}

function isCloudAuthCallbackUrl(value) {
  return cloudAuthService.isCallbackUrl(value);
}

registerCloudAuthProtocol();

app.on("second-instance", (_event, argv) => {
  const callbackUrl = argv.find(isCloudAuthCallbackUrl);
  if (callbackUrl) {
    void cloudAuthService.handleCallback(callbackUrl);
    return;
  }

  const workspacePath = findWorkspacePathArg(argv);
  if (workspacePath) {
    void openWorkspaceInNewWindow(workspacePath);
    return;
  }
  createOrRevealWindow();
});

app.on("open-url", (event, callbackUrl) => {
  if (!isCloudAuthCallbackUrl(callbackUrl)) return;
  event.preventDefault();
  void cloudAuthService.handleCallback(callbackUrl);
});

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    setDockIcon();
    setDockMenu();
  }

  registerLocalFileProtocol();
  updateService = createUpdateService({
    app,
    ipcMain,
    getWindows: () => BrowserWindow.getAllWindows(),
    getRestartBlockers: getUpdateRestartBlockers,
  });
  registerIpcHandlers();
  updateService.start();
  await createWindow({
    initialWorkspacePath: await readLastActiveWorkspacePath(),
  });

  app.on("activate", () => {
    if (windowsById.size > 0) {
      revealLastFocusedWindow();
      return;
    }
    void readLastActiveWorkspacePath()
      .then((initialWorkspacePath) => createWindow({ initialWorkspacePath }));
  });
}).catch((error) => {
  console.error("puppyone failed to start:", error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  cloudAuthService.dispose();
  updateService?.dispose();
  closeAllTerminalSessions();
  closeAllWorkspaceWatchers();
});

function registerIpcHandlers() {
  ipcMain.handle("window:get-initial-workspace", async (event) => {
    return getInitialWorkspaceResultForWindow(event.sender);
  });

  ipcMain.handle("cloud-session:read", async () => {
    return cloudAuthService.readSession();
  });

  ipcMain.handle("cloud-session:restore", async (_event, request) => {
    const apiBase = normalizeCloudApiBase(request?.apiBaseUrl);
    return cloudAuthService.restoreSession(apiBase);
  });

  ipcMain.handle("cloud-session:start-oauth", async (_event, request) => {
    const apiBase = normalizeCloudApiBase(request?.apiBaseUrl);
    if (!apiBase) throw new Error("Cloud API base URL is required.");
    return cloudAuthService.startOAuth({ apiBase, provider: request?.provider });
  });

  ipcMain.handle("cloud-session:clear", async () => {
    await cloudAuthService.clearSession();
    return { ok: true };
  });

  ipcMain.handle("cloud:api-request", async (_event, request) => {
    const apiBase = normalizeCloudApiBase(request?.apiBaseUrl);
    if (!apiBase) throw new Error("Cloud API base URL is required.");
    const apiPath = requireCloudApiPath(request?.path);
    const method = typeof request?.method === "string" && request.method.trim()
      ? request.method.trim().toUpperCase()
      : "GET";
    const headers = normalizeCloudRequestHeaders(request?.headers);
    const body = typeof request?.body === "string" ? request.body : undefined;
    return requestCloudApi(apiBase, apiPath, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
  });

  ipcMain.handle("cloud:session-api-request", async (_event, request) => {
    const apiBase = normalizeCloudApiBase(request?.apiBaseUrl);
    if (!apiBase) throw new Error("Cloud API base URL is required.");
    const apiPath = requireCloudApiPath(request?.path);
    const method = typeof request?.method === "string" && request.method.trim()
      ? request.method.trim().toUpperCase()
      : "GET";
    const headers = normalizeCloudRequestHeaders(request?.headers);
    const body = typeof request?.body === "string" ? request.body : undefined;
    return cloudAuthService.requestSessionApi(apiBase, apiPath, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
  });

  ipcMain.handle("cloud:access-point-list-directory", async (_event, request) => {
    const accessKey = requireNonEmptyString(request?.accessKey, "Access point key is required.");
    const relPath = typeof request?.path === "string" ? request.path.replace(/^\/+/, "") : "";
    const userEmail = typeof request?.userEmail === "string" && request.userEmail.trim()
      ? request.userEmail.trim()
      : null;
    const apiBases = buildCloudApiBaseCandidates(request?.remoteUrl, request?.apiBaseUrl);
    return fetchCloudAccessPointDirectory({
      accessKey,
      path: relPath,
      userEmail,
      apiBases,
    });
  });

  ipcMain.handle("cloud:access-point-semantics", async (_event, request) => {
    const accessKey = requireNonEmptyString(request?.accessKey, "Access point key is required.");
    const userEmail = typeof request?.userEmail === "string" && request.userEmail.trim()
      ? request.userEmail.trim()
      : null;
    const apiBases = buildCloudApiBaseCandidates(request?.remoteUrl, request?.apiBaseUrl);
    return fetchCloudAccessPointSemantics({
      accessKey,
      userEmail,
      apiBases,
    });
  });

  ipcMain.handle("system:open-external-url", async (_event, href) => {
    const url = requireSafeExternalUrl(href);
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("workspace:get-last", async () => {
    return getLastWorkspaceResult();
  });

  ipcMain.handle("workspace:get-recent", async () => {
    return getRecentWorkspacesResult();
  });

  ipcMain.handle("workspace:remember-last", async (_event, folderPath) => {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    await rememberRecentWorkspacePath(folderPath);
    return { ok: true };
  });

  ipcMain.handle("workspace:forget-last", async (event) => {
    await forgetCurrentWindowWorkspace(event.sender);
    return { ok: true };
  });

  ipcMain.handle("workspace:show-homepage", async (event) => {
    await showHomepageForCurrentWindow(event.sender);
    return { ok: true };
  });

  ipcMain.handle("workspace:open-current", async (event, folderPath) => {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    return openWorkspaceInCurrentWindow(event.sender, folderPath);
  });

  ipcMain.handle("workspace:open-new-window", async (_event, folderPath) => {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    return openWorkspaceInNewWindow(folderPath);
  });

  ipcMain.handle("workspace:select-folder", async (event) => {
    return selectWorkspaceForCurrentWindow(event.sender);
  });

  ipcMain.handle("workspace:select-folder-current", async (event) => {
    return selectWorkspaceForCurrentWindow(event.sender);
  });

  ipcMain.handle("workspace:select-folder-new-window", async (event) => {
    return selectWorkspaceForNewWindow(event.sender);
  });

  ipcMain.handle("workspace:from-path", async (_event, folderPath) => {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    return workspaceFromPath(folderPath);
  });

  ipcMain.handle("workspace:list-folder-children", async (_event, request) => {
    const rootPath = request?.rootPath;
    const folderPath = request?.folderPath ?? null;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    return listFolderChildren(rootPath, folderPath);
  });

  ipcMain.handle("workspace:read-file", async (_event, request) => {
    const rootPath = request?.rootPath;
    const filePath = request?.path;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    return readWorkspaceTextFile(rootPath, filePath);
  });

  ipcMain.handle("workspace:write-file", async (_event, request) => {
    const rootPath = request?.rootPath;
    const filePath = request?.path;
    const content = request?.content;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    await writeWorkspaceTextFile(rootPath, filePath, content);
    await absorbWorkspaceEditReviewPath(rootPath, filePath);
  });

  ipcMain.handle("workspace:create-entry", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const result = await createWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:rename-entry", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const previousPath = request?.path;
    const result = await renameWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, previousPath);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:move-entry", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const previousPath = request?.fromPath;
    const result = await moveWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, previousPath);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:import-entries", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const result = await importWorkspaceEntries(rootPath, request);
    await Promise.all(result.paths.map((importedPath) => absorbWorkspaceEditReviewPath(rootPath, importedPath)));
    return result;
  });

  ipcMain.handle("workspace:delete-entry", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const result = await deleteWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:reveal-entry-in-finder", async (_event, request) => {
    const rootPath = request?.rootPath;
    const entryPath = request?.path;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }

    const targetPath = resolveLocalWorkspacePath(rootPath, entryPath);
    await fs.promises.stat(targetPath).catch((error) => {
      throw new Error(`Unable to reveal entry in Finder: ${error.message}`);
    });
    shell.showItemInFolder(targetPath);
    return { ok: true };
  });

  ipcMain.handle("workspace:watch-start", async (event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    startWorkspaceWatch(event.sender, rootPath);
    return { ok: true };
  });

  ipcMain.handle("workspace:watch-stop", async (event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    stopWorkspaceWatch(event.sender.id, rootPath);
    return { ok: true };
  });

  ipcMain.handle("ai-edit-review:get-latest", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    await initializeWorkspaceEditReview(rootPath);
    return getLatestWorkspaceEditReviewRequest(rootPath);
  });

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
    return runWorkspaceGitIpcOperation(event, request, "pull", () => (
      pullWorkspaceGit(requireWorkspaceRoot(request))
    ));
  });

  ipcMain.handle("workspace:git-push", async (event, request) => {
    return runWorkspaceGitIpcOperation(event, request, "push", () => (
      pushWorkspaceGit(requireWorkspaceRoot(request))
    ));
  });

  ipcMain.handle("workspace:git-publish-branch", async (_event, request) => {
    return publishWorkspaceGitBranch(requireWorkspaceRoot(request), request?.remoteName);
  });

  ipcMain.handle("workspace:git-sync", async (_event, request) => {
    return syncWorkspaceGit(requireWorkspaceRoot(request));
  });

  ipcMain.handle("terminal:create", async (event, request) => {
    const cwd = normalizeTerminalCwd(request?.cwd);
    const id = normalizeTerminalId(request?.id);
    const cols = normalizeTerminalSize(request?.cols, 80, 20, 400);
    const rows = normalizeTerminalSize(request?.rows, 24, 8, 120);
    const spawnConfig = buildTerminalSpawnConfig();

    closeTerminalSession(id);
    await initializeWorkspaceEditReview(cwd).catch((error) => {
      console.warn("Unable to initialize edit review baseline:", error);
    });

    let terminal;
    try {
      terminal = pty.spawn(spawnConfig.file, spawnConfig.args, {
        name: "xterm-256color",
        cwd,
        cols,
        rows,
        env: buildTerminalEnv(),
      });
    } catch (error) {
      throw new Error(`Failed to start terminal: ${error instanceof Error ? error.message : String(error)}`);
    }

    const session = {
      id,
      terminal,
      sender: event.sender,
      cols,
      rows,
    };

    terminalSessions.set(id, session);

    terminal.onData((data) => sendTerminalData(session, data));
    terminal.onExit(({ exitCode, signal }) => {
      sendTerminalExit(session, exitCode, signal ? String(signal) : null);
      terminalSessions.delete(id);
    });

    return {
      id,
      pid: terminal.pid ?? null,
      shell: spawnConfig.displayShell,
      cwd,
    };
  });

  ipcMain.on("terminal:input", (_event, request) => {
    const session = getTerminalSession(request?.id);
    const data = request?.data;
    if (!session || typeof data !== "string" || data.length === 0) return;
    session.terminal.write(data);
  });

  ipcMain.on("terminal:resize", (_event, request) => {
    const session = getTerminalSession(request?.id);
    if (!session) return;
    const cols = normalizeTerminalSize(request?.cols, 80, 20, 400);
    const rows = normalizeTerminalSize(request?.rows, 24, 8, 120);
    session.cols = cols;
    session.rows = rows;
    session.terminal.resize(cols, rows);
  });

  ipcMain.handle("terminal:close", async (_event, id) => {
    closeTerminalSession(id);
  });
}

function getUpdateRestartBlockers() {
  const blockers = [];
  if (terminalSessions.size > 0) {
    blockers.push({
      id: "terminal-sessions",
      label: "Terminal session running",
      detail: "Close the active terminal session before restarting to update.",
    });
  }
  return blockers;
}

function requireWorkspaceRoot(request) {
  const rootPath = request?.rootPath;
  if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
    throw new Error("Workspace root path is required.");
  }
  return rootPath;
}

async function runWorkspaceGitIpcOperation(event, request, operation, handler) {
  try {
    return await handler();
  } catch (error) {
    if (request?.showNativeErrorDialog === true) {
      void showWorkspaceGitErrorDialog(event.sender, operation, error);
    }
    throw error;
  }
}

async function showWorkspaceGitErrorDialog(sender, operation, error) {
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

async function getInitialWorkspaceResultForWindow(sender) {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) {
    return {
      path: null,
      workspace: null,
      error: null,
    };
  }

  const state = windowStateById.get(window.webContents.id);
  const initialPath = state?.workspacePath ?? state?.initialWorkspacePath ?? null;
  if (!initialPath) {
    return {
      path: null,
      workspace: null,
      error: null,
    };
  }

  try {
    const workspace = await workspaceFromPath(initialPath);
    const canonicalPath = await canonicalizeWorkspacePath(workspace.path);
    const existingWindow = getWorkspaceWindow(canonicalPath);
    if (existingWindow && existingWindow !== window) {
      revealWindow(existingWindow);
      return {
        path: canonicalPath,
        workspace: null,
        error: `${workspace.name} is already open in another puppyone window.`,
      };
    }

    assignWindowWorkspace(window, workspace, canonicalPath, { cleanupPrevious: false });
    await rememberRecentWorkspacePath(canonicalPath);
    return {
      path: canonicalPath,
      workspace,
      error: null,
    };
  } catch (error) {
    return {
      path: initialPath,
      workspace: null,
      error: `Unable to reopen workspace (${initialPath}): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function selectWorkspaceForCurrentWindow(sender) {
  const result = await showWorkspaceOpenDialog(getDialogOwnerWindow(sender));

  if (result.canceled || result.filePaths.length === 0) return null;
  return openWorkspaceInCurrentWindow(sender, result.filePaths[0]);
}

async function selectWorkspaceForNewWindow(sender = null) {
  const ownerWindow = sender ? getDialogOwnerWindow(sender) : getLastFocusedWindow() ?? undefined;
  const result = await showWorkspaceOpenDialog(ownerWindow);

  if (result.canceled || result.filePaths.length === 0) return null;
  return openWorkspaceInNewWindow(result.filePaths[0]);
}

async function showWorkspaceOpenDialog(ownerWindow) {
  const options = {
    title: "Open local puppyone workspace",
    properties: ["openDirectory", "createDirectory"],
  };

  return ownerWindow && !ownerWindow.isDestroyed()
    ? dialog.showOpenDialog(ownerWindow, options)
    : dialog.showOpenDialog(options);
}

async function openWorkspaceInCurrentWindow(sender, folderPath, options = {}) {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) {
    throw new Error("No active window is available for this workspace.");
  }

  const workspace = await workspaceFromPath(folderPath);
  const canonicalPath = await canonicalizeWorkspacePath(workspace.path);
  const existingWindow = getWorkspaceWindow(canonicalPath);
  if (existingWindow && existingWindow !== window) {
    revealWindow(existingWindow);
    if (options.remember !== false) await rememberRecentWorkspacePath(canonicalPath);
    return {
      status: "focused-existing",
      path: canonicalPath,
      workspace,
    };
  }

  assignWindowWorkspace(window, workspace, canonicalPath);
  if (options.remember !== false) await rememberRecentWorkspacePath(canonicalPath);
  return {
    status: "opened-current",
    path: canonicalPath,
    workspace,
  };
}

async function openWorkspaceInNewWindow(folderPath, options = {}) {
  const workspace = await workspaceFromPath(folderPath);
  const canonicalPath = await canonicalizeWorkspacePath(workspace.path);
  const existingWindow = getWorkspaceWindow(canonicalPath);
  if (existingWindow) {
    revealWindow(existingWindow);
    if (options.remember !== false) await rememberRecentWorkspacePath(canonicalPath);
    return {
      status: "focused-existing",
      path: canonicalPath,
      workspace,
    };
  }

  const window = await createWindow({
    initialWorkspacePath: canonicalPath,
  });
  assignWindowWorkspace(window, workspace, canonicalPath, { cleanupPrevious: false });
  if (options.remember !== false) await rememberRecentWorkspacePath(canonicalPath);
  return {
    status: "opened-new-window",
    path: canonicalPath,
    workspace,
  };
}

function assignWindowWorkspace(window, workspace, canonicalPath, options = {}) {
  if (!window || window.isDestroyed()) return;
  const webContentsId = window.webContents.id;
  const state = getOrCreateWindowState(window);
  const previousPath = state.workspacePath;

  if (previousPath && previousPath !== canonicalPath) {
    const previousWindow = workspaceWindowByPath.get(previousPath);
    if (previousWindow === window || previousWindow?.isDestroyed()) {
      workspaceWindowByPath.delete(previousPath);
    }
    if (options.cleanupPrevious !== false) {
      closeTerminalSessionsForWindow(webContentsId);
      stopWorkspaceWatchesForWindow(webContentsId);
    }
  }

  state.initialWorkspacePath = canonicalPath;
  state.workspacePath = canonicalPath;
  workspaceWindowByPath.set(canonicalPath, window);
  window.setTitle(`${appName} - ${workspace.name}`);
  if (typeof window.setRepresentedFilename === "function") {
    try {
      window.setRepresentedFilename(canonicalPath);
    } catch {
      // setRepresentedFilename is macOS-only and best-effort.
    }
  }
}

function releaseWindowWorkspace(window) {
  if (!window) return null;
  return releaseWindowWorkspaceById(window.webContents.id, window);
}

function releaseWindowWorkspaceById(webContentsId, window = null) {
  const state = windowStateById.get(webContentsId);
  const workspacePath = state?.workspacePath ?? null;
  if (workspacePath) {
    const existingWindow = workspaceWindowByPath.get(workspacePath);
    if (existingWindow === window || existingWindow?.isDestroyed()) {
      workspaceWindowByPath.delete(workspacePath);
    }
  }
  if (state) {
    state.workspacePath = null;
    state.initialWorkspacePath = null;
  }
  if (window && !window.isDestroyed()) {
    window.setTitle(appName);
  }
  return workspacePath;
}

async function forgetCurrentWindowWorkspace(sender) {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) {
    await forgetLastWorkspacePath();
    return;
  }

  const releasedPath = releaseWindowWorkspace(window);
  closeTerminalSessionsForWindow(window.webContents.id);
  stopWorkspaceWatchesForWindow(window.webContents.id);
  if (releasedPath) await removeRecentWorkspacePath(releasedPath);
}

function getOrCreateWindowState(window) {
  const webContentsId = window.webContents.id;
  let state = windowStateById.get(webContentsId);
  if (!state) {
    state = {
      initialWorkspacePath: null,
      workspacePath: null,
      lastFocusedAt: Date.now(),
    };
    windowStateById.set(webContentsId, state);
  }
  return state;
}

function getWorkspaceWindow(canonicalPath) {
  const window = workspaceWindowByPath.get(canonicalPath);
  if (!window || window.isDestroyed()) {
    workspaceWindowByPath.delete(canonicalPath);
    return null;
  }
  return window;
}

function getDialogOwnerWindow(sender) {
  const window = BrowserWindow.fromWebContents(sender);
  if (window && !window.isDestroyed()) return window;
  return getLastFocusedWindow() ?? undefined;
}

async function canonicalizeWorkspacePath(folderPath) {
  const resolvedPath = path.resolve(folderPath);
  return fs.promises.realpath(resolvedPath).catch(() => resolvedPath);
}

async function getLastWorkspaceResult() {
  const folderPath = await readLastActiveWorkspacePath();
  if (!folderPath) {
    return {
      path: null,
      workspace: null,
      error: null,
    };
  }

  try {
    return {
      path: folderPath,
      workspace: await workspaceFromPath(folderPath),
      error: null,
    };
  } catch (error) {
    return {
      path: folderPath,
      workspace: null,
      error: `Unable to reopen last workspace (${folderPath}): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function getRecentWorkspacesResult() {
  const state = normalizeWorkspaceState(await readWorkspaceState());
  const items = [];
  const workspaces = [];
  const errors = [];
  for (const record of state.recentWorkspaceRecords) {
    try {
      const workspace = await workspaceFromPath(record.path);
      items.push({
        workspace,
        lastOpenedAt: record.lastOpenedAt,
      });
      workspaces.push(workspace);
    } catch (error) {
      errors.push({
        path: record.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { workspaces, items, errors };
}

async function showHomepageForCurrentWindow(sender) {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) return;
  releaseWindowWorkspace(window);
  closeTerminalSessionsForWindow(window.webContents.id);
  stopWorkspaceWatchesForWindow(window.webContents.id);
}

function normalizeWorkspaceTimestamp(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return timestamp.toISOString();
}

function normalizeWorkspaceRecord(value) {
  if (typeof value === "string") {
    return {
      path: value,
      lastOpenedAt: null,
    };
  }
  if (!value || typeof value !== "object") return null;
  return {
    path: value.path,
    lastOpenedAt: normalizeWorkspaceTimestamp(value.lastOpenedAt),
  };
}

async function readLastActiveWorkspacePath() {
  const state = normalizeWorkspaceState(await readWorkspaceState());
  const candidates = [
    state.lastActiveWorkspacePath,
    state.recentWorkspacePaths[0],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return path.resolve(candidate);
    }
  }
  return null;
}

async function readWorkspaceState() {
  try {
    const raw = await fs.promises.readFile(getWorkspaceStatePath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to read puppyone workspace state:", error);
    }
    return {};
  }
}

function normalizeWorkspaceState(state) {
  const recentWorkspaceRecords = [];
  const addPath = (value, lastOpenedAt = null) => {
    if (typeof value !== "string" || value.trim().length === 0) return;
    const resolvedPath = path.resolve(value);
    const normalizedLastOpenedAt = normalizeWorkspaceTimestamp(lastOpenedAt);
    const existing = recentWorkspaceRecords.find((record) => record.path === resolvedPath);
    if (existing) {
      if (normalizedLastOpenedAt) existing.lastOpenedAt = normalizedLastOpenedAt;
      return;
    }
    recentWorkspaceRecords.push({
      path: resolvedPath,
      lastOpenedAt: normalizedLastOpenedAt,
    });
  };

  addPath(state?.lastActiveWorkspacePath);
  if (Array.isArray(state?.recentWorkspaces)) {
    for (const item of state.recentWorkspaces) {
      const record = normalizeWorkspaceRecord(item);
      if (record) addPath(record.path, record.lastOpenedAt);
    }
  }
  if (Array.isArray(state?.recentWorkspacePaths)) {
    for (const item of state.recentWorkspacePaths) addPath(item);
  }
  addPath(state?.lastWorkspacePath);
  const recentWorkspacePaths = recentWorkspaceRecords.map((record) => record.path);

  return {
    lastActiveWorkspacePath: recentWorkspacePaths[0] ?? null,
    recentWorkspacePaths,
    recentWorkspaceRecords,
  };
}

async function writeWorkspaceState(state) {
  await fs.promises.mkdir(path.dirname(getWorkspaceStatePath()), { recursive: true });
  await fs.promises.writeFile(
    getWorkspaceStatePath(),
    JSON.stringify(state, null, 2),
    "utf8",
  );
}

async function rememberRecentWorkspacePath(folderPath) {
  const canonicalPath = await canonicalizeWorkspacePath(folderPath);
  const state = normalizeWorkspaceState(await readWorkspaceState());
  const recentWorkspaceRecords = [
    {
      path: canonicalPath,
      lastOpenedAt: new Date().toISOString(),
    },
    ...state.recentWorkspaceRecords.filter((item) => item.path !== canonicalPath),
  ].slice(0, 20);
  await writeWorkspaceState({
    lastActiveWorkspacePath: canonicalPath,
    recentWorkspacePaths: recentWorkspaceRecords.map((record) => record.path),
    recentWorkspaces: recentWorkspaceRecords,
  });
}

async function removeRecentWorkspacePath(folderPath) {
  const canonicalPath = await canonicalizeWorkspacePath(folderPath);
  const state = normalizeWorkspaceState(await readWorkspaceState());
  const recentWorkspaceRecords = state.recentWorkspaceRecords.filter((item) => item.path !== canonicalPath);
  await writeWorkspaceState({
    lastActiveWorkspacePath: recentWorkspaceRecords[0]?.path ?? null,
    recentWorkspacePaths: recentWorkspaceRecords.map((record) => record.path),
    recentWorkspaces: recentWorkspaceRecords,
  });
}

async function forgetLastWorkspacePath() {
  await fs.promises.rm(getWorkspaceStatePath(), { force: true });
}

function getWorkspaceStatePath() {
  return path.join(app.getPath("userData"), workspaceStateFilename);
}

function requireNonEmptyString(value, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}

function requireCloudApiPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    throw new Error("Cloud API path must be a root-relative path.");
  }
  return value;
}

function requireSafeExternalUrl(value) {
  const rawUrl = requireNonEmptyString(value, "External URL is required.");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("External URL is invalid.");
  }

  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
    throw new Error("External URL protocol is not allowed.");
  }

  return url.toString();
}

function normalizeCloudRequestHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (value == null) continue;
    normalized[key] = String(value);
  }
  return normalized;
}

function buildCloudApiBaseCandidates(remoteUrl, apiBaseUrl) {
  const candidates = [];
  addUniqueCloudApiBase(candidates, cloudApiBaseFromRemote(remoteUrl));
  addUniqueCloudApiBase(candidates, normalizeCloudApiBase(apiBaseUrl));
  return candidates;
}

function addUniqueCloudApiBase(candidates, apiBase) {
  if (!apiBase || candidates.includes(apiBase)) return;
  candidates.push(apiBase);
}

function cloudApiBaseFromRemote(remoteUrl) {
  return cloudApiBaseUrlFromRemote(remoteUrl);
}

function normalizeCloudApiBase(apiBaseUrl) {
  return normalizeCloudApiBaseUrl(apiBaseUrl);
}

async function fetchCloudAccessPointDirectory({ accessKey, path: relPath, userEmail, apiBases }) {
  if (apiBases.length === 0) {
    throw new Error("Cloud API host is unavailable for this Git remote.");
  }

  const query = new URLSearchParams({
    path: relPath,
    include_hidden: "true",
    include_size: "true",
  });
  const headers = {
    "Content-Type": "application/json",
    "X-Access-Key": accessKey,
    "X-Puppy-Client": "cli",
  };
  if (userEmail) headers["X-PuppyOne-User"] = userEmail;

  const errors = [];
  for (const apiBase of apiBases) {
    try {
      return await requestCloudApi(apiBase, `/ap-fs/ls?${query.toString()}`, {
        method: "GET",
        headers,
      });
    } catch (error) {
      errors.push(`${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to load Cloud contents from the Git remote. Tried ${errors.join(" ; ")}`);
}

async function fetchCloudAccessPointSemantics({ accessKey, userEmail, apiBases }) {
  if (apiBases.length === 0) {
    throw new Error("Cloud API host is unavailable for this Git remote.");
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Access-Key": accessKey,
    "X-Puppy-Client": "cli",
  };
  if (userEmail) headers["X-PuppyOne-User"] = userEmail;

  const errors = [];
  for (const apiBase of apiBases) {
    try {
      return await requestCloudApi(apiBase, "/ap-fs/semantics", {
        method: "GET",
        headers,
      });
    } catch (error) {
      errors.push(`${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to resolve Cloud project metadata from the Git remote. Tried ${errors.join(" ; ")}`);
}

async function requestCloudApi(apiBase, apiPath, init) {
  let response;
  try {
    response = await fetch(`${apiBase}${apiPath}`, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to reach Cloud API at ${apiBase}. ${reason}`);
  }

  let payload = null;
  const raw = await response.text();
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = new Error(getCloudApiErrorMessage(payload, `Request failed (${response.status})`));
    error.status = response.status;
    throw error;
  }

  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

function getCloudApiErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== "object") return fallback;
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string" && detail.message.trim()) return detail.message;
    if (typeof detail.detail === "string" && detail.detail.trim()) return detail.detail;
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  return fallback;
}

function normalizeTerminalCwd(cwd) {
  if (typeof cwd === "string" && cwd.trim().length > 0) {
    return path.resolve(cwd);
  }
  return os.homedir();
}

function normalizeTerminalId(id) {
  if (typeof id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(id)) {
    return id;
  }
  return randomUUID();
}

function normalizeTerminalSize(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(Math.round(next), min), max);
}

function buildTerminalSpawnConfig() {
  if (process.platform === "win32") {
    const file = process.env.ComSpec || "cmd.exe";
    return {
      file,
      args: [],
      displayShell: path.basename(file),
    };
  }

  const file = process.env.SHELL || "/bin/zsh";
  const shellName = path.basename(file);
  const args = shellName === "bash" || shellName === "zsh" ? ["-l"] : [];

  return {
    file,
    args,
    displayShell: shellName,
  };
}

function buildTerminalEnv() {
  const env = { ...process.env };
  delete env.NO_COLOR;

  return {
    ...env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    CLICOLOR: env.CLICOLOR || "1",
    TERM_PROGRAM: "PuppyOne",
    TERM_PROGRAM_VERSION: app.getVersion(),
    PUPPYONE_TERMINAL: "1",
  };
}

function getTerminalSession(id) {
  if (typeof id !== "string") return null;
  return terminalSessions.get(id) ?? null;
}

function sendTerminalData(session, data) {
  if (session.sender.isDestroyed()) return;
  session.sender.send("terminal:data", {
    id: session.id,
    data: String(data),
  });
}

function sendTerminalExit(session, code, signal) {
  if (session.sender.isDestroyed()) return;
  session.sender.send("terminal:exit", {
    id: session.id,
    code,
    signal,
  });
}

function closeTerminalSession(id) {
  const session = getTerminalSession(id);
  if (!session) return;
  terminalSessions.delete(session.id);
  try {
    session.terminal.kill();
  } catch {
    // The PTY may already be gone.
  }
}

function closeTerminalSessionsForWindow(webContentsId) {
  for (const [id, session] of Array.from(terminalSessions.entries())) {
    if (session.sender.id === webContentsId) {
      closeTerminalSession(id);
    }
  }
}

function closeAllTerminalSessions() {
  for (const id of Array.from(terminalSessions.keys())) {
    closeTerminalSession(id);
  }
}

function startWorkspaceWatch(sender, rootPath) {
  const resolvedRoot = path.resolve(rootPath);
  let entry = workspaceWatchers.get(resolvedRoot);

  if (!entry) {
    entry = createWorkspaceWatcher(resolvedRoot);
    workspaceWatchers.set(resolvedRoot, entry);
  }

  entry.clients.set(sender.id, sender);
  sender.once("destroyed", () => {
    stopWorkspaceWatch(sender.id, resolvedRoot);
  });
}

function stopWorkspaceWatch(webContentsId, rootPath) {
  const resolvedRoot = path.resolve(rootPath);
  const entry = workspaceWatchers.get(resolvedRoot);
  if (!entry) return;

  entry.clients.delete(webContentsId);
  if (entry.clients.size === 0) {
    clearTimeout(entry.debounceTimer);
    clearTimeout(entry.editReviewTimer);
    entry.watcher.close();
    disposeWorkspaceEditReview(resolvedRoot);
    workspaceWatchers.delete(resolvedRoot);
  }
}

function stopWorkspaceWatchesForWindow(webContentsId) {
  for (const rootPath of Array.from(workspaceWatchers.keys())) {
    stopWorkspaceWatch(webContentsId, rootPath);
  }
}

function createWorkspaceWatcher(rootPath) {
  const clients = new Map();
  const entry = {
    clients,
    debounceTimer: null,
    editReviewTimer: null,
    lastEvent: null,
    watcher: null,
  };

  void initializeWorkspaceEditReview(rootPath).catch((error) => {
    console.warn("Unable to initialize edit review baseline:", error);
  });

  entry.watcher = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
    if (shouldIgnoreWorkspaceChange(filename)) return;

    entry.lastEvent = {
      rootPath,
      eventType: eventType ?? "change",
      path: typeof filename === "string" ? filename : null,
    };
    noteWorkspaceEditReviewPath(rootPath, typeof filename === "string" ? filename : null);
    scheduleWorkspaceEditReviewFlush(entry, rootPath);
    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => {
      broadcastWorkspaceChange(entry);
    }, 200);
  });

  entry.watcher.on("error", (error) => {
    entry.lastEvent = {
      rootPath,
      eventType: "error",
      path: null,
      error: error instanceof Error ? error.message : String(error),
    };
    broadcastWorkspaceChange(entry);
  });

  return entry;
}

function scheduleWorkspaceEditReviewFlush(entry, rootPath) {
  clearTimeout(entry.editReviewTimer);
  entry.editReviewTimer = setTimeout(() => {
    entry.editReviewTimer = null;
    void flushWorkspaceEditReviewChanges(rootPath)
      .then((request) => {
        if (request) broadcastWorkspaceEditReviewChange(entry, rootPath, request);
      })
      .catch((error) => {
        console.warn("Unable to flush edit review changes:", error);
      });
  }, WORKSPACE_EDIT_REVIEW_FLUSH_DELAY_MS);
}

function broadcastWorkspaceChange(entry) {
  if (!entry.lastEvent) return;

  for (const [id, sender] of entry.clients.entries()) {
    if (sender.isDestroyed()) {
      entry.clients.delete(id);
      continue;
    }
    sender.send("workspace:changed", entry.lastEvent);
  }
}

function broadcastWorkspaceEditReviewChange(entry, rootPath, request) {
  for (const [id, sender] of entry.clients.entries()) {
    if (sender.isDestroyed()) {
      entry.clients.delete(id);
      continue;
    }
    sender.send("ai-edit-review:updated", {
      rootPath,
      request,
    });
  }
}

function shouldIgnoreWorkspaceChange(filename) {
  if (!filename) return false;
  const normalized = String(filename).replaceAll("\\", "/");
  return normalized === ".git" || normalized.startsWith(".git/");
}

function closeAllWorkspaceWatchers() {
  for (const entry of workspaceWatchers.values()) {
    clearTimeout(entry.debounceTimer);
    clearTimeout(entry.editReviewTimer);
    entry.watcher.close();
  }
  for (const rootPath of workspaceWatchers.keys()) {
    disposeWorkspaceEditReview(rootPath);
  }
  workspaceWatchers.clear();
}

function findWorkspacePathArg(argv) {
  for (const arg of [...argv].reverse()) {
    if (typeof arg !== "string" || arg.trim().length === 0) continue;
    if (isCloudAuthCallbackUrl(arg)) continue;
    if (arg.startsWith("-")) continue;
    const candidate = path.resolve(arg);
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Not a local directory argument.
    }
  }
  return null;
}

function registerLocalFileProtocol() {
  protocol.handle("puppyone-local", async (request) => {
    const { rootPath, relativePath } = parseLocalFileUrl(request.url);
    const contentType = getMimeType(relativePath) ?? "application/octet-stream";
    return new Response(await readWorkspaceFile(rootPath, relativePath), {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
      },
    });
  });
}

function parseLocalFileUrl(rawUrl) {
  const url = new URL(rawUrl);

  if (url.hostname === "file") {
    const segments = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    const encodedRootPath = segments.shift();
    if (!encodedRootPath) {
      throw new Error("Missing local file root path.");
    }
    return {
      rootPath: decodeURIComponent(encodedRootPath),
      relativePath: segments.map((segment) => decodeURIComponent(segment)).join("/"),
    };
  }

  return {
    rootPath: decodeURIComponent(url.hostname),
    relativePath: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
  };
}
