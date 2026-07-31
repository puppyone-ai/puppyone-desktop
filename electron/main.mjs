import { installBrokenStdioGuards } from "./main/stdio-guard.mjs";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, safeStorage, session as electronSession, shell, WebContentsView } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  getMimeType,
  openWorkspaceFileRangeStream,
  readWorkspaceTextFile,
  readWorkspaceFile,
  statWorkspaceFile,
  resolveLocalWorkspaceIdentity,
  resolveWorkspacePath as resolveLocalWorkspacePath,
  workspaceFromPath,
} from "../local-api/workspace.mjs";
import { initializeWorkspaceEditReview } from "../local-api/edit-review.mjs";
import { createUpdateService } from "./update-service.mjs";
import { createAppPreviewRuntime } from "./app-preview-runtime.mjs";
import {
  configureDesktopApplicationIdentity,
  loadDesktopBuildInfo,
} from "./main/build-info-service.mjs";
import { createEphemeralAgentSessionCache } from "./main/agent/cache/ephemeral-agent-session-cache.mjs";
import { createAgentQuitCoordinator } from "./main/agent/agent-shutdown.mjs";
import { createAgentService } from "./main/agent/agent-service.mjs";
import { createAgentAttachmentStore } from "./main/agent/agent-attachment-store.mjs";
import { createLocalAgentInventory } from "./main/agent/connections/local-agent-inventory.mjs";
import { createDefaultAgentRuntimeHost } from "./main/agent/bootstrap/create-agent-runtime-host.mjs";
import {
  getCloudApiErrorMessage,
  requestCloudApi,
} from "./main/cloud-api-client.mjs";
import { createCloudAuthService } from "./cloud-auth-service.mjs";
import {
  createApplicationQuitIntent,
  createDocumentSessionCloseCoordinator,
} from "./main/document-session-close-coordinator.mjs";
import {
  createDesktopLaunchIntent,
  handleSecondInstanceLaunch,
} from "./main/desktop-launch-intent.mjs";
import { registerAgentIpcHandlers } from "./main/ipc/agent-ipc.mjs";
import { registerAppPreviewIpcHandlers } from "./main/ipc/app-preview-ipc.mjs";
import { registerBuildInfoIpcHandlers } from "./main/ipc/build-info-ipc.mjs";
import { registerCloudIpcHandlers } from "./main/ipc/cloud-ipc.mjs";
import { registerCloudPublishIpcHandlers } from "./main/ipc/cloud-publish-ipc.mjs";
import { registerMarkdownWebEmbedIpcHandlers } from "./main/ipc/markdown-web-embed-ipc.mjs";
import { registerLocalizationIpcHandlers } from "./main/ipc/localization-ipc.mjs";
import { createMarkdownWebEmbedService } from "./main/markdown-web-embed-service.mjs";
import { registerFeedbackIpcHandlers } from "./main/ipc/feedback-ipc.mjs";
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
import { createDesktopLocaleService } from "./main/localization/desktop-locale-service.mjs";
import { createWorkspaceWatchService } from "./main/workspace-watch-service.mjs";
import { createGitMetadataWatchService } from "./main/git-metadata-watch-service.mjs";
import { createGitOperationCoordinator } from "./main/git-operation-coordinator.mjs";
import { createCloudPublishCoordinator } from "./main/cloud-publish-coordinator.mjs";
import { createCloudPublishSecretVault } from "./main/cloud-publish-secret-vault.mjs";
import { createCloudGitConnectCoordinator } from "./main/cloud-git-connect-coordinator.mjs";
import { createCloudGitOperationLease } from "./main/cloud-git-operation-lease.mjs";
import { createCloudPublishGitCredentialManager } from "./main/cloud-publish-git-credentials.mjs";
import {
  getViewerPackPrivilegedSchemes,
  loadViewerPackRuntime,
} from "./main/viewer-packs/bootstrap.mjs";
import { resolveViewerPackFeatureProfile } from "./main/viewer-packs/feature-profile.mjs";

// Must run before any console.* / IPC replyWithError logging: broken inherited
// stdout/stderr (Dock launch, detached child, closed terminal) otherwise throws
// uncaught `write EIO` / `write EPIPE` and Electron shows a fatal dialog.
installBrokenStdioGuards();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json");
const projectRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const rendererDistPath = path.join(projectRoot, "dist", "index.html");
const desktopBuildInfo = loadDesktopBuildInfo({
  app,
  packageMetadata,
  projectRoot,
});
const desktopApplicationIdentity = configureDesktopApplicationIdentity({
  app,
  buildInfo: desktopBuildInfo,
});
const appName = desktopApplicationIdentity.applicationName;

// Resolve only core launch data before the single-instance boundary. A
// duplicate CLI launch must exit before optional subsystems are constructed.
const initialLaunchIntent = createDesktopLaunchIntent({
  argv: process.argv,
  workingDirectory: process.cwd(),
  isPackaged: app.isPackaged,
});
const gotSingleInstanceLock = app.requestSingleInstanceLock(initialLaunchIntent);
if (!gotSingleInstanceLock) {
  app.exit(0);
}

const devServerUrl = process.env.PUPPYONE_DESKTOP_DEV_URL;
const rendererApplicationUrl = devServerUrl || pathToFileURL(rendererDistPath).toString();
const viewerPackFeatureProfile = resolveViewerPackFeatureProfile({
  packageMetadata,
  environment: process.env,
  isPackaged: app.isPackaged,
});
const workspaceStateFilename = "desktop-workspace-state.json";
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
let stopLocaleNativeRefresh = null;
const windowsById = new Map();
const windowStateById = new Map();
const workspaceWindowByPath = new Map();
const localFileCapabilities = createLocalFileCapabilityStore();
let lastFocusedWindowId = null;
const trustedIpcMain = createTrustedIpcMain({
  ipcMain,
  applicationUrl: rendererApplicationUrl,
});
const localeService = createDesktopLocaleService({
  app,
  getWindows: () => BrowserWindow.getAllWindows(),
});
const applicationQuitIntent = createApplicationQuitIntent({ app });
const documentSessionCloseCoordinator = createDocumentSessionCloseCoordinator({
  dialog,
  t: (messageId, values) => localeService.t(messageId, values),
  onCloseCancelled: applicationQuitIntent.cancel,
});
documentSessionCloseCoordinator.registerIpc(trustedIpcMain);
const authorizeWorkspaceRoot = createSenderWorkspaceAuthorization({
  getWorkspaceRootForSender,
});
const terminalService = createTerminalService({
  appVersion: desktopBuildInfo.version,
  initializeWorkspaceEditReview,
});
const agentSessionCache = createEphemeralAgentSessionCache({ app });
const agentRuntimeRegistry = createDefaultAgentRuntimeHost({
  appVersion: desktopBuildInfo.version,
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
  managedOpenCodeConfigDir: path.join(app.getPath("userData"), "agent-runtime", "opencode", "config"),
  allowExternalOpenCode: !app.isPackaged && process.env.PUPPYONE_ALLOW_EXTERNAL_OPENCODE === "1",
});
const agentAttachmentStore = createAgentAttachmentStore({
  rootPath: path.join(app.getPath("userData"), "agent-runtime", "attachments"),
});
void agentAttachmentStore.initialize().catch((error) => {
  console.error("puppyone failed to initialize Agent attachment staging:", error);
});
const agentService = createAgentService({
  runtimeRegistry: agentRuntimeRegistry,
  sessionCache: agentSessionCache,
  attachmentStore: agentAttachmentStore,
});
const localAgentInventory = createLocalAgentInventory({
  appVersion: desktopBuildInfo.version,
  cacheFilePath: path.join(app.getPath("userData"), "agent-runtime-inventory.json"),
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
  requestCloudApi,
  getCloudApiErrorMessage,
  secureStorage: safeStorage,
  openExternal: (href) => shell.openExternal(href),
  localCloudWebUrl: process.env.VITE_DESKTOP_CLOUD_WEB_URL,
  getWindows: () => BrowserWindow.getAllWindows(),
  revealWindow: revealLastFocusedWindow,
});
const gitOperationCoordinator = createGitOperationCoordinator();
const cloudPublishSecretVault = createCloudPublishSecretVault({
  baseDirectory: path.join(app.getPath("userData"), "cloud-publish-secrets-v1"),
  secureStorage: safeStorage,
});
const cloudGitOperationLease = createCloudGitOperationLease();
const cloudGitCredentialManager = createCloudPublishGitCredentialManager();
const cloudPublishCoordinator = createCloudPublishCoordinator({
  cloudAuthService,
  gitCredentialManager: cloudGitCredentialManager,
  gitOperationCoordinator,
  logger: console,
  operationLease: cloudGitOperationLease,
  secretVault: cloudPublishSecretVault,
});
const cloudGitConnectCoordinator = createCloudGitConnectCoordinator({
  cloudAuthService,
  gitCredentialManager: cloudGitCredentialManager,
  gitOperationCoordinator,
  operationLease: cloudGitOperationLease,
  secretVault: cloudPublishSecretVault,
});

async function createWindow(options = {}) {
  await localeService.refreshSystemLanguages();
  const initialWorkspacePath = typeof options.initialWorkspacePath === "string"
    ? path.resolve(options.initialWorkspacePath)
    : null;
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
  documentSessionCloseCoordinator.attachWindow(window);
  installWindowNavigationSecurity({
    webContents: window.webContents,
    applicationUrl: rendererApplicationUrl,
    shell,
  });
  windowsById.set(webContentsId, window);
  windowStateById.set(webContentsId, {
    initialWorkspacePath,
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
  void createOrRevealWindow().catch((error) => {
    console.error("Unable to reveal the last focused puppyone window:", error);
  });
}

async function createOrRevealWindow() {
  const window = getLastFocusedWindow();
  if (window) {
    revealWindow(window);
    return window;
  }
  return createWindow();
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
      label: localeService.t("native.dock.newWindow"),
      click: () => {
        void createWindow();
      },
    },
  ]);

  app.dock.setMenu(dockMenu);
}

app.on("second-instance", (_event, argv, workingDirectory, launchIntent) => {
  void handleSecondInstanceLaunch({
    launchIntent,
    argv,
    workingDirectory,
    isPackaged: app.isPackaged,
    openWorkspaceInNewWindow,
    revealOrCreateWindow: createOrRevealWindow,
    reportError: (message, error) => console.error(message, error),
  });
});

app.whenReady().then(async () => {
  await localeService.initialize();
  stopLocaleNativeRefresh = localeService.onDidChange(() => {
    setDockMenu();
  });
  if (process.platform === "darwin" && app.dock) {
    setDockIcon();
    setDockMenu();
  }

  registerLocalFileProtocol({
    protocol,
    readWorkspaceFile,
    openWorkspaceFileRangeStream,
    statWorkspaceFile,
    getMimeType,
    canonicalizeWorkspacePath,
    isOpenWorkspaceRoot,
    resolveCapability: localFileCapabilities.resolve,
    applicationUrl: rendererApplicationUrl,
  });
  updateService = createUpdateService({
    app,
    buildInfo: desktopBuildInfo,
    ipcMain: trustedIpcMain,
    getWindows: () => BrowserWindow.getAllWindows(),
    getRestartBlockers: getUpdateRestartBlockers,
    confirmRestartWithBlockers: confirmUpdateRestartWithBlockers,
  });
  appPreviewRuntime = createAppPreviewRuntime({
    app,
    dialog,
    shell,
    readWorkspaceTextFile,
    resolveWorkspacePath: resolveLocalWorkspacePath,
    t: (messageId, values) => localeService.t(messageId, values),
  });
  if (viewerPackFeatureProfile.externalViewerPacks) {
    viewerPackRuntime = await loadViewerPackRuntime(true);
    viewerPackHost = viewerPackRuntime.createViewerPackHost({
      WebContentsView,
      sessionFromPartition: (partition, options) => electronSession.fromPartition(partition, options),
      getOwnerWindow: (ownerWebContentsId) => windowsById.get(ownerWebContentsId) ?? null,
      getMimeType,
      userDataPath: app.getPath("userData"),
      appVersion: desktopBuildInfo.version,
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
  const initialWorkspacePath = initialLaunchIntent.workspacePath
    ?? await workspaceStateStore.readLastActiveWorkspacePath();
  await createWindow({ initialWorkspacePath });

  app.on("activate", () => {
    void localeService.refreshSystemLanguages().catch((error) => {
      console.warn("Unable to refresh the system language preference:", error);
    });
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
  // A prevented BrowserWindow close cancels Electron's original quit attempt.
  // Resume it after the asynchronous document drain closes the last window.
  applicationQuitIntent.resumeAfterLastWindowClosed();
});

// Keep persistence dependencies alive while BrowserWindow close handlers ask
// renderer Document Sessions to drain. `will-quit` runs only after every
// window accepted closing, so a failed flush can safely leave the app usable.
app.on("will-quit", () => {
  stopLocaleNativeRefresh?.();
  localeService.dispose();
  cloudAuthService.dispose();
  updateService?.dispose();
  viewerPackHost?.destroyAllSessions();
  appPreviewRuntime?.closeAll();
  terminalService.closeAll();
  localAgentInventory.dispose();
  workspaceWatchService.closeAll();
  gitMetadataWatchService.closeAll();
});

app.on("before-quit", applicationQuitIntent.markRequested);

app.on("before-quit", createAgentQuitCoordinator({
  app,
  agentService,
  // Agent runtimes require an asynchronous pre-quit drain. General services
  // are intentionally disposed in will-quit, after document persistence.
  disposeApplicationServices: () => undefined,
}));

function registerIpcHandlers() {
  registerBuildInfoIpcHandlers({
    ipcMain: trustedIpcMain,
    buildInfo: desktopBuildInfo,
  });
  registerLocalizationIpcHandlers({
    ipcMain: trustedIpcMain,
    localeService,
  });
  registerWorkspaceNavigationIpcHandlers({
    ipcMain: trustedIpcMain,
    workspaceStateStore,
    getInitialWorkspaceResultForWindow,
    forgetCurrentWindowWorkspace,
    showHomepageForCurrentWindow,
    openWorkspaceInCurrentWindow,
    openWorkspaceInNewWindow,
    selectWorkspaceForCurrentWindow,
    selectWorkspaceForNewWindow,
  });
  registerCloudIpcHandlers({ ipcMain: trustedIpcMain, cloudAuthService });
  registerCloudPublishIpcHandlers({
    ipcMain: trustedIpcMain,
    authorizeWorkspaceRoot,
    cloudGitConnectCoordinator,
    cloudPublishCoordinator,
  });
  registerSystemIpcHandlers({ ipcMain: trustedIpcMain, shell, setDockIcon });
  registerFeedbackIpcHandlers({
    ipcMain: trustedIpcMain,
    appVersion: desktopBuildInfo.version,
  });
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
    workspaceWatchService,
    t: (messageId, values) => localeService.t(messageId, values),
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
    cloudGitCredentialManager,
    cloudGitOperationLease,
    gitOperationCoordinator,
    t: (messageId, values) => localeService.t(messageId, values),
  });
  registerTerminalIpcHandlers({
    ipcMain: trustedIpcMain,
    terminalService,
    authorizeWorkspaceRoot,
  });
  registerAgentIpcHandlers({
    ipcMain: trustedIpcMain,
    agentService,
    localAgentInventory,
    authorizeWorkspaceRoot,
    attachmentStore: agentAttachmentStore,
    dialog,
    getDialogOwnerWindow,
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
      t: (messageId, values) => localeService.t(messageId, values),
    });
    // Plugin bridge (document/resource/ui/host) uses RAW ipcMain because the
    // sandboxed pack frame's URL is never the trusted application URL; each
    // handler validates sender → session before doing anything.
    viewerPackRuntime.registerViewerPackPluginIpcHandlers({ ipcMain, host: viewerPackHost });
  }
}

function getUpdateRestartBlockers() {
  const blockers = [];
  const terminalSessionCount = terminalService.getSessionCount();
  if (terminalSessionCount > 0) {
    blockers.push({
      id: "terminal-sessions",
      label: localeService.t("native.update.blocker.terminal.label", {
        count: terminalSessionCount,
      }),
      detail: localeService.t("native.update.blocker.terminal.detail", {
        count: terminalSessionCount,
      }),
    });
  }
  const agentSessionCount = agentService.getSessionCount();
  if (agentSessionCount > 0) {
    blockers.push({
      id: "agent-sessions",
      label: localeService.t("native.update.blocker.agent.label", {
        count: agentSessionCount,
      }),
      detail: localeService.t("native.update.blocker.agent.detail", {
        count: agentSessionCount,
      }),
    });
  }
  return blockers;
}

async function confirmUpdateRestartWithBlockers({
  availableVersion,
  blockers,
}) {
  const version = typeof availableVersion === "string" && availableVersion.trim()
    ? availableVersion.trim()
    : desktopBuildInfo.version;
  const blockerDetails = blockers
    .map((blocker) => blocker.detail ?? blocker.label)
    .filter(Boolean)
    .map((detail) => `• ${detail}`)
    .join("\n");
  const options = {
    type: "warning",
    buttons: [
      localeService.t("native.update.confirm.cancel"),
      localeService.t("native.update.confirm.proceed"),
    ],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: localeService.t("native.update.confirm.title"),
    message: localeService.t("native.update.confirm.message", { version }),
    detail: [
      localeService.t("native.update.confirm.detail"),
      blockerDetails,
    ].filter(Boolean).join("\n\n"),
  };
  const owner = getLastFocusedWindow();
  const result = owner
    ? await dialog.showMessageBox(owner, options)
    : await dialog.showMessageBox(options);
  return result.response === 1;
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
    title: localeService.t("native.workspace.open.title"),
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
  return workspacePath;
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
