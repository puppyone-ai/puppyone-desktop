import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, safeStorage, session as electronSession, shell, WebContentsView } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  getMimeType,
  readWorkspaceTextFile,
  readWorkspaceFile,
  resolveLocalWorkspaceIdentity,
  resolveWorkspacePath as resolveLocalWorkspacePath,
  workspaceFromPath,
} from "../local-api/workspace.mjs";
import { initializeWorkspaceEditReview } from "../local-api/edit-review.mjs";
import { createUpdateService } from "./update-service.mjs";
import { createAppPreviewRuntime } from "./app-preview-runtime.mjs";
import { createAgentPersistence } from "./main/agent/agent-persistence.mjs";
import { createAgentQuitCoordinator } from "./main/agent/agent-shutdown.mjs";
import { createAgentService } from "./main/agent/agent-service.mjs";
import { createDefaultAgentRuntimeHost } from "./main/agent/runtime/agent-runtime-registry.mjs";
import {
  getCloudApiErrorMessage,
  requestCloudApi,
} from "./main/cloud-api-client.mjs";
import { createCloudAuthService } from "./cloud-auth-service.mjs";
import { registerAgentIpcHandlers } from "./main/ipc/agent-ipc.mjs";
import { registerAppPreviewIpcHandlers } from "./main/ipc/app-preview-ipc.mjs";
import { registerCloudIpcHandlers } from "./main/ipc/cloud-ipc.mjs";
import { registerMarkdownWebEmbedIpcHandlers } from "./main/ipc/markdown-web-embed-ipc.mjs";
import { createMarkdownWebEmbedService } from "./main/markdown-web-embed-service.mjs";
import { registerSystemIpcHandlers } from "./main/ipc/system-ipc.mjs";
import { registerTerminalIpcHandlers } from "./main/ipc/terminal-ipc.mjs";
import { registerWorkspaceFileIpcHandlers } from "./main/ipc/workspace-files-ipc.mjs";
import { registerWorkspaceGitIpcHandlers } from "./main/ipc/workspace-git-ipc.mjs";
import { registerWorkspaceNavigationIpcHandlers } from "./main/ipc/workspace-navigation-ipc.mjs";
import { registerWorkspaceWatchIpcHandlers } from "./main/ipc/workspace-watch-ipc.mjs";
import { registerGitMetadataWatchIpcHandlers } from "./main/ipc/git-metadata-watch-ipc.mjs";
import { registerLocalFileProtocol } from "./main/local-file-protocol.mjs";
import { createLocalFileCapabilityStore } from "./main/local-file-capabilities.mjs";
import { installWindowNavigationSecurity, requireNonEmptyString } from "./main/security.mjs";
import { createTerminalService } from "./main/terminal-service.mjs";
import { createTrustedIpcMain } from "./main/trusted-ipc.mjs";
import { createSenderWorkspaceAuthorization } from "./main/workspace-authorization.mjs";
import { createWorkspaceStateStore } from "./main/workspace-state-store.mjs";
import { createWorkspaceWatchService } from "./main/workspace-watch-service.mjs";
import { createGitMetadataWatchService } from "./main/git-metadata-watch-service.mjs";
import {
  getViewerPackPrivilegedSchemes,
  loadViewerPackRuntime,
} from "./main/viewer-packs/bootstrap.mjs";
import { resolveViewerPackFeatureProfile } from "./main/viewer-packs/feature-profile.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json");
const projectRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const rendererDistPath = path.join(projectRoot, "dist", "index.html");
const appName = "puppyone";
const devServerUrl = process.env.PUPPYONE_DESKTOP_DEV_URL;
const rendererApplicationUrl = devServerUrl || pathToFileURL(rendererDistPath).toString();
const viewerPackFeatureProfile = resolveViewerPackFeatureProfile({
  packageMetadata,
  environment: process.env,
  isPackaged: app.isPackaged,
});
const workspaceStateFilename = "desktop-workspace-state.json";
const cloudAuthProtocol = "puppyone";
const dockIconResources = Object.freeze({
  polished: "logo-square.png",
  light: "dock-icon-light.png",
  matte: "dock-icon-matte.png",
});
const macTitlebarOptions = process.platform === "darwin"
  ? {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 13, y: 12 },
    }
  : {
      titleBarStyle: "default",
    };

const privilegedSchemes = [
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
];

privilegedSchemes.push(...getViewerPackPrivilegedSchemes(
  viewerPackFeatureProfile.externalViewerPacks,
));

protocol.registerSchemesAsPrivileged(privilegedSchemes);

let updateService = null;
let appPreviewRuntime = null;
let viewerPackHost = null;
let viewerPackRuntime = null;
const windowsById = new Map();
const windowStateById = new Map();
const workspaceWindowByPath = new Map();
const localFileCapabilities = createLocalFileCapabilityStore();
let lastFocusedWindowId = null;
const trustedIpcMain = createTrustedIpcMain({
  ipcMain,
  applicationUrl: rendererApplicationUrl,
});
const authorizeWorkspaceRoot = createSenderWorkspaceAuthorization({
  getWorkspaceRootForSender,
});
const terminalService = createTerminalService({
  appVersion: app.getVersion(),
  initializeWorkspaceEditReview,
});
const agentPersistence = createAgentPersistence({ app });
const agentRuntimeRegistry = createDefaultAgentRuntimeHost({
  appVersion: app.getVersion(),
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
  managedOpenCodeConfigDir: path.join(app.getPath("userData"), "agent-runtime", "opencode", "config"),
});
const agentService = createAgentService({
  appVersion: app.getVersion(),
  runtimeRegistry: agentRuntimeRegistry,
  persistence: agentPersistence,
});
const workspaceWatchService = createWorkspaceWatchService();
const gitMetadataWatchService = createGitMetadataWatchService();
const workspaceStateStore = createWorkspaceStateStore({
  app,
  filename: workspaceStateFilename,
  canonicalizeWorkspacePath,
  workspaceFromPath,
  resolveWorkspaceIdentity: resolveLocalWorkspaceIdentity,
});
const cloudAuthService = createCloudAuthService({
  app,
  projectRoot,
  protocol: cloudAuthProtocol,
  requestCloudApi,
  getCloudApiErrorMessage,
  secureStorage: safeStorage,
  openExternal: (href) => shell.openExternal(href),
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
  const initialWorkspace = normalizeVirtualWorkspace(options.initialWorkspace);
  const appIconPath = resolveAppIconPath();
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
      additionalArguments: viewerPackFeatureProfile.rendererArguments,
    },
  });
  const webContentsId = window.webContents.id;
  installWindowNavigationSecurity({
    webContents: window.webContents,
    applicationUrl: rendererApplicationUrl,
    shell,
  });
  windowsById.set(webContentsId, window);
  windowStateById.set(webContentsId, {
    initialWorkspacePath,
    initialWorkspace,
    workspace: null,
    workspacePath: null,
    lastFocusedAt: Date.now(),
  });
  lastFocusedWindowId = webContentsId;

  window.on("focus", () => {
    lastFocusedWindowId = webContentsId;
    const state = windowStateById.get(webContentsId);
    if (state) state.lastFocusedAt = Date.now();
    if (!window.webContents.isDestroyed()) {
      window.webContents.send("git-repository:window-focus", { focused: true });
    }
  });

  window.on("blur", () => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send("git-repository:window-focus", { focused: false });
    }
  });

  window.once("ready-to-show", () => {
    revealWindow(window);
  });

  window.webContents.once("did-finish-load", () => {
    console.info("puppyone renderer finished loading:", window.webContents.getURL());
    revealWindow(window);
  });

  window.webContents.on("console-message", (details) => {
    console.log("puppyone renderer console:", {
      level: details.level,
      message: details.message,
      line: details.lineNumber,
      sourceId: details.sourceId,
    });
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("puppyone renderer failed to load:", {
      errorCode,
      errorDescription,
      validatedURL,
    });
    revealWindow(window);
  });

  window.webContents.on("preload-error", (_event, preloadPathWithError, error) => {
    console.error("puppyone preload failed:", {
      preloadPath: preloadPathWithError,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("puppyone renderer process gone:", details);
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
    viewerPackHost?.destroySessionsForOwner(webContentsId);
    appPreviewRuntime?.closeSessionsForWindow(webContentsId);
    terminalService.closeSessionsForWindow(webContentsId);
    void agentService.closeSessionsForWindow(webContentsId);
    workspaceWatchService.stopForWindow(webContentsId);
    gitMetadataWatchService.stopForWindow(webContentsId);
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
    path.join(process.resourcesPath ?? projectRoot, "logo-square.png"),
    path.join(projectRoot, "dist", "logo-square.png"),
    path.join(projectRoot, "public", "logo-square.png"),
    path.join(process.resourcesPath ?? projectRoot, "icon.icns"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function resolveDockIconPath(iconId) {
  const normalizedIconId = Object.hasOwn(dockIconResources, iconId) ? iconId : "polished";
  const resourceFilename = dockIconResources[normalizedIconId];
  const sourceFilename = normalizedIconId === "light"
    ? "logo-square-v0.1.3-light.png"
    : normalizedIconId === "matte" ? "logo-square-v0.1.3-dark.png" : "logo-square.png";
  const candidates = [
    path.join(process.resourcesPath ?? projectRoot, resourceFilename),
    path.join(projectRoot, "public", sourceFilename),
  ];
  return {
    iconId: normalizedIconId,
    path: candidates.find((candidate) => fs.existsSync(candidate)) ?? null,
  };
}

function setDockIcon(iconId = "polished") {
  if (process.platform !== "darwin" || !app.dock) {
    return { supported: false, iconId: "polished" };
  }
  const resolved = resolveDockIconPath(iconId);
  if (!resolved.path) return { supported: true, iconId: resolved.iconId, applied: false };
  try {
    app.dock.setIcon(resolved.path);
    return { supported: true, iconId: resolved.iconId, applied: true };
  } catch (error) {
    console.warn("Unable to set puppyone dock icon:", error);
    return { supported: true, iconId: resolved.iconId, applied: false };
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

  registerLocalFileProtocol({
    protocol,
    readWorkspaceFile,
    getMimeType,
    canonicalizeWorkspacePath,
    isOpenWorkspaceRoot,
    resolveCapability: localFileCapabilities.resolve,
    applicationUrl: rendererApplicationUrl,
  });
  updateService = createUpdateService({
    app,
    ipcMain: trustedIpcMain,
    getWindows: () => BrowserWindow.getAllWindows(),
    getRestartBlockers: getUpdateRestartBlockers,
  });
  appPreviewRuntime = createAppPreviewRuntime({
    app,
    dialog,
    shell,
    readWorkspaceTextFile,
    resolveWorkspacePath: resolveLocalWorkspacePath,
  });
  if (viewerPackFeatureProfile.externalViewerPacks) {
    viewerPackRuntime = await loadViewerPackRuntime(true);
    viewerPackHost = viewerPackRuntime.createViewerPackHost({
      WebContentsView,
      sessionFromPartition: (partition, options) => electronSession.fromPartition(partition, options),
      getOwnerWindow: (ownerWebContentsId) => windowsById.get(ownerWebContentsId) ?? null,
      getMimeType,
      userDataPath: app.getPath("userData"),
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      allowTestKeys: !app.isPackaged && process.env.PUPPYONE_VIEWER_PACK_ALLOW_TEST_KEYS === "1",
      getThemeSnapshot: () => ({
        mode: nativeTheme.shouldUseDarkColors ? "dark" : "light",
        tokens: {},
      }),
    });
  }
  registerIpcHandlers();
  updateService.start();
  await createWindow({
    initialWorkspacePath: await workspaceStateStore.readLastActiveWorkspacePath(),
  });

  app.on("activate", () => {
    if (windowsById.size > 0) {
      revealLastFocusedWindow();
      return;
    }
    void workspaceStateStore.readLastActiveWorkspacePath()
      .then((initialWorkspacePath) => createWindow({ initialWorkspacePath }));
  });
}).catch((error) => {
  console.error("puppyone failed to start:", error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", createAgentQuitCoordinator({
  app,
  agentService,
  disposeApplicationServices: () => {
    cloudAuthService.dispose();
    updateService?.dispose();
    viewerPackHost?.destroyAllSessions();
    appPreviewRuntime?.closeAll();
    terminalService.closeAll();
    workspaceWatchService.closeAll();
    gitMetadataWatchService.closeAll();
  },
}));

function registerIpcHandlers() {
  registerWorkspaceNavigationIpcHandlers({
    ipcMain: trustedIpcMain,
    workspaceStateStore,
    getInitialWorkspaceResultForWindow,
    forgetCurrentWindowWorkspace,
    showHomepageForCurrentWindow,
    openWorkspaceInCurrentWindow,
    openWorkspaceInNewWindow,
    createCloudWorkspaceFromRequest,
    openVirtualWorkspaceInNewWindow,
    selectWorkspaceForCurrentWindow,
    selectWorkspaceForNewWindow,
  });
  registerCloudIpcHandlers({ ipcMain: trustedIpcMain, cloudAuthService });
  registerSystemIpcHandlers({ ipcMain: trustedIpcMain, shell, setDockIcon });
  registerMarkdownWebEmbedIpcHandlers({
    ipcMain: trustedIpcMain,
    createMarkdownWebEmbedService,
    getOwnerWindow: (webContentsId) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.webContents?.id === webContentsId) return window;
      }
      return null;
    },
  });

  registerWorkspaceFileIpcHandlers({
    app,
    ipcMain: trustedIpcMain,
    BrowserWindow,
    dialog,
    fs,
    shell,
    authorizeWorkspaceRoot,
    localFileCapabilities,
  });

  registerAppPreviewIpcHandlers({
    ipcMain: trustedIpcMain,
    appPreviewRuntime,
    authorizeWorkspaceRoot,
  });
  registerWorkspaceWatchIpcHandlers({
    ipcMain: trustedIpcMain,
    workspaceWatchService,
    authorizeWorkspaceRoot,
  });
  registerGitMetadataWatchIpcHandlers({
    ipcMain: trustedIpcMain,
    gitMetadataWatchService,
    authorizeWorkspaceRoot,
  });

  registerWorkspaceGitIpcHandlers({
    ipcMain: trustedIpcMain,
    BrowserWindow,
    dialog,
    authorizeWorkspaceRoot,
  });
  registerTerminalIpcHandlers({
    ipcMain: trustedIpcMain,
    terminalService,
    authorizeWorkspaceRoot,
  });
  registerAgentIpcHandlers({
    ipcMain: trustedIpcMain,
    agentService,
    authorizeWorkspaceRoot,
  });

  if (viewerPackHost && viewerPackRuntime) {
    // App authority (install/activate/bounds/destroy) is gated to the trusted
    // application frame.
    viewerPackRuntime.registerViewerPackAppIpcHandlers({
      ipcMain: trustedIpcMain,
      host: viewerPackHost,
      authorizeWorkspaceRoot,
      dialog,
      getDialogOwnerWindow,
    });
    // Plugin bridge (document/resource/ui/host) uses RAW ipcMain because the
    // sandboxed pack frame's URL is never the trusted application URL; each
    // handler validates sender → session before doing anything.
    viewerPackRuntime.registerViewerPackPluginIpcHandlers({ ipcMain, host: viewerPackHost });
  }
}

function getUpdateRestartBlockers() {
  const blockers = [];
  if (terminalService.getSessionCount() > 0) {
    blockers.push({
      id: "terminal-sessions",
      label: "Terminal session running",
      detail: "Close the active terminal session before restarting to update.",
    });
  }
  if (agentService.getSessionCount() > 0) {
    blockers.push({
      id: "agent-sessions",
      label: "Agent session running",
      detail: "Close the active Agent session before restarting to update.",
    });
  }
  return blockers;
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
  const virtualWorkspace = getVirtualWorkspaceForState(state, initialPath);
  if (virtualWorkspace) {
    const existingWindow = getWorkspaceWindow(virtualWorkspace.path);
    if (existingWindow && existingWindow !== window) {
      revealWindow(existingWindow);
      return {
        path: virtualWorkspace.path,
        workspace: null,
        error: `${virtualWorkspace.name} is already open in another puppyone window.`,
      };
    }

    assignWindowWorkspace(window, virtualWorkspace, virtualWorkspace.path, { cleanupPrevious: false });
    return {
      path: virtualWorkspace.path,
      workspace: virtualWorkspace,
      error: null,
    };
  }
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
    await workspaceStateStore.rememberRecentWorkspacePath(canonicalPath, workspace);
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
    if (options.remember !== false) await workspaceStateStore.rememberRecentWorkspacePath(canonicalPath, workspace);
    return {
      status: "focused-existing",
      path: canonicalPath,
      workspace,
    };
  }

  assignWindowWorkspace(window, workspace, canonicalPath);
  if (options.remember !== false) await workspaceStateStore.rememberRecentWorkspacePath(canonicalPath, workspace);
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
    if (options.remember !== false) await workspaceStateStore.rememberRecentWorkspacePath(canonicalPath, workspace);
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
  if (options.remember !== false) await workspaceStateStore.rememberRecentWorkspacePath(canonicalPath, workspace);
  return {
    status: "opened-new-window",
    path: canonicalPath,
    workspace,
  };
}

async function openVirtualWorkspaceInNewWindow(workspace, options = {}) {
  const canonicalPath = workspace.path;
  const existingWindow = getWorkspaceWindow(canonicalPath);
  if (existingWindow) {
    revealWindow(existingWindow);
    return {
      status: "focused-existing",
      path: canonicalPath,
      workspace,
    };
  }

  const window = await createWindow({
    initialWorkspace: workspace,
  });
  assignWindowWorkspace(window, workspace, canonicalPath, { cleanupPrevious: false });
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
    viewerPackHost?.destroySessionsForOwner(webContentsId);
    localFileCapabilities.revokeSender(webContentsId);
    const previousWindow = workspaceWindowByPath.get(previousPath);
    if (previousWindow === window || previousWindow?.isDestroyed()) {
      workspaceWindowByPath.delete(previousPath);
    }
    if (options.cleanupPrevious !== false) {
      appPreviewRuntime?.closeSessionsForWindow(webContentsId);
      terminalService.closeSessionsForWindow(webContentsId);
      void agentService.closeSessionsForWindow(webContentsId);
      workspaceWatchService.stopForWindow(webContentsId);
      gitMetadataWatchService.stopForWindow(webContentsId);
    }
  }

  state.initialWorkspacePath = canonicalPath;
  state.initialWorkspace = isVirtualWorkspacePath(canonicalPath) ? workspace : null;
  state.workspace = workspace;
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
  viewerPackHost?.destroySessionsForOwner(webContentsId);
  localFileCapabilities.revokeSender(webContentsId);
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
    state.workspace = null;
    state.initialWorkspace = null;
  }
  if (window && !window.isDestroyed()) {
    window.setTitle(appName);
  }
  return workspacePath;
}

async function forgetCurrentWindowWorkspace(sender) {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) {
    await workspaceStateStore.forgetLastWorkspacePath();
    return;
  }

  const releasedPath = releaseWindowWorkspace(window);
  appPreviewRuntime?.closeSessionsForWindow(window.webContents.id);
  terminalService.closeSessionsForWindow(window.webContents.id);
  void agentService.closeSessionsForWindow(window.webContents.id);
  workspaceWatchService.stopForWindow(window.webContents.id);
  gitMetadataWatchService.stopForWindow(window.webContents.id);
  if (releasedPath) await workspaceStateStore.removeRecentWorkspacePath(releasedPath);
}

function getOrCreateWindowState(window) {
  const webContentsId = window.webContents.id;
  let state = windowStateById.get(webContentsId);
  if (!state) {
    state = {
      initialWorkspacePath: null,
      initialWorkspace: null,
      workspace: null,
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

function isOpenWorkspaceRoot(canonicalPath) {
  return Boolean(getWorkspaceWindow(canonicalPath));
}

function getWorkspaceRootForSender(sender) {
  const state = windowStateById.get(sender.id);
  const workspacePath = state?.workspacePath ?? null;
  return workspacePath && !isVirtualWorkspacePath(workspacePath) ? workspacePath : null;
}

function getDialogOwnerWindow(sender) {
  const window = BrowserWindow.fromWebContents(sender);
  if (window && !window.isDestroyed()) return window;
  return getLastFocusedWindow() ?? undefined;
}

function createCloudWorkspaceFromRequest(request) {
  const projectId = requireNonEmptyString(request?.projectId, "Cloud project id is required.");
  const rawName = typeof request?.name === "string" ? request.name.trim() : "";
  return {
    id: `cloud:${projectId}`,
    name: rawName || "Untitled Project",
    path: `cloud://${projectId}`,
    status: "protected",
    cloudState: "synced",
  };
}

function normalizeVirtualWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object") return null;
  const rawPath = typeof workspace.path === "string" ? workspace.path.trim() : "";
  if (!isVirtualWorkspacePath(rawPath)) return null;
  const projectId = rawPath.slice("cloud://".length).trim();
  if (!projectId) return null;
  const rawName = typeof workspace.name === "string" ? workspace.name.trim() : "";
  return {
    id: typeof workspace.id === "string" && workspace.id.trim() ? workspace.id.trim() : `cloud:${projectId}`,
    name: rawName || "Untitled Project",
    path: `cloud://${projectId}`,
    status: typeof workspace.status === "string" && workspace.status.trim() ? workspace.status.trim() : "protected",
    cloudState: typeof workspace.cloudState === "string" && workspace.cloudState.trim() ? workspace.cloudState.trim() : "synced",
  };
}

function getVirtualWorkspaceForState(state, initialPath) {
  if (!state || !isVirtualWorkspacePath(initialPath)) return null;
  const workspace = normalizeVirtualWorkspace(state.workspace) ?? normalizeVirtualWorkspace(state.initialWorkspace);
  return workspace?.path === initialPath ? workspace : null;
}

function isVirtualWorkspacePath(value) {
  return typeof value === "string" && value.startsWith("cloud://");
}

async function canonicalizeWorkspacePath(folderPath) {
  const resolvedPath = path.resolve(folderPath);
  return fs.promises.realpath(resolvedPath).catch(() => resolvedPath);
}

async function showHomepageForCurrentWindow(sender) {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) return;
  releaseWindowWorkspace(window);
  appPreviewRuntime?.closeSessionsForWindow(window.webContents.id);
  terminalService.closeSessionsForWindow(window.webContents.id);
  void agentService.closeSessionsForWindow(window.webContents.id);
  workspaceWatchService.stopForWindow(window.webContents.id);
  gitMetadataWatchService.stopForWindow(window.webContents.id);
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
