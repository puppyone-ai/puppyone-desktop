import { randomUUID } from "node:crypto";

const DEFAULT_LOAD_TIMEOUT_MS = 20_000;
const MAX_CANCELLED_ATTACHMENTS = 256;

/**
 * Owns native browser surfaces for local PuppyOne applications.
 *
 * Runtime processes deliberately outlive renderer attachments. A surface can
 * therefore be detached while a source file is open, then reattached without
 * reloading the page or losing browser state. The maps and opaque identifiers
 * are intentionally tab-ready: every app keeps an isolated surface per owner,
 * while only the currently attached editor is visible.
 */
export function createAppPreviewBrowserSurfaceManager({
  WebContentsView,
  sessionFromPartition,
  getOwnerWindow,
  publishState = () => {},
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
}) {
  if (typeof WebContentsView !== "function") {
    throw new TypeError("App preview WebContentsView constructor is required.");
  }
  if (typeof sessionFromPartition !== "function") {
    throw new TypeError("App preview session factory is required.");
  }
  if (typeof getOwnerWindow !== "function") {
    throw new TypeError("App preview owner resolver is required.");
  }

  const surfaces = new Map();
  const surfaceIdsByApp = new Map();
  const ownerStates = new Map();
  const pendingByApp = new Map();
  const cancelledAttachments = new Map();
  let disposed = false;

  async function activate(request) {
    assertNotDisposed();
    const normalized = normalizeActivationRequest(request);
    return serializeAppOperation(normalized.surfaceKey, async () => {
      assertNotDisposed();
      const window = requireOwnerWindow(normalized.ownerWebContentsId);
      let surface = getAppSurface(normalized.surfaceKey);

      if (surface && (surface.appId !== normalized.appId || surface.appPath !== normalized.appPath)) {
        destroySurface(surface.surfaceId, { reason: "app-replaced" });
        surface = null;
      }

      if (!surface) {
        surface = createSurface(normalized, window);
      } else if (surface.window !== window) {
        destroySurface(surface.surfaceId, { reason: "owner-changed" });
        surface = createSurface(normalized, window);
      }

      surface.runtimeId = normalized.runtimeId;
      surface.requestedBounds = normalized.bounds;
      surface.attachmentId = normalized.attachmentId;
      surface.message = null;

      const shouldLoad = surface.url !== normalized.url || surface.status === "error";
      if (shouldLoad) {
        surface.url = normalized.url;
        surface.allowedOrigin = new URL(normalized.url).origin;
        surface.status = "loading";
        publishSurfaceState(surface);
        try {
          await loadUrlWithTimeout(surface.view.webContents, normalized.url, loadTimeoutMs);
          if (!surfaces.has(surface.surfaceId) || surface.view.webContents?.isDestroyed?.()) {
            throw new Error("App preview browser surface was destroyed while loading.");
          }
          surface.status = "ready";
          surface.message = null;
          refreshNavigationState(surface);
        } catch (error) {
          if (surfaces.has(surface.surfaceId)) {
            surface.status = "error";
            surface.message = error instanceof Error ? error.message : String(error);
            detachNativeView(surface);
            publishSurfaceState(surface);
          }
          throw error;
        }
      }

      if (consumeCancelledAttachment(normalized.ownerWebContentsId, normalized.attachmentId)) {
        surface.attachmentId = null;
        detachNativeView(surface);
      } else {
        attachNativeView(surface);
      }
      publishSurfaceState(surface);
      return serializeSurface(surface);
    });
  }

  function setBounds({ surfaceId, attachmentId, bounds, callerWebContentsId }) {
    const surface = requireOwnedSurface(surfaceId, callerWebContentsId);
    if (!surface || surface.attachmentId !== normalizeAttachmentId(attachmentId)) {
      return { ok: false, visible: false };
    }
    surface.requestedBounds = normalizeBounds(bounds, { allowHidden: true });
    const visible = applySurfaceBounds(surface);
    return { ok: true, visible };
  }

  function detach({ surfaceId = null, attachmentId, callerWebContentsId }) {
    const normalizedAttachmentId = normalizeAttachmentId(attachmentId);
    markCancelledAttachment(callerWebContentsId, normalizedAttachmentId);

    const candidates = surfaceId
      ? [surfaces.get(surfaceId)].filter(Boolean)
      : Array.from(surfaces.values()).filter(
        (surface) => surface.ownerWebContentsId === callerWebContentsId,
      );
    let detached = false;
    for (const surface of candidates) {
      if (
        surface.ownerWebContentsId !== callerWebContentsId ||
        surface.attachmentId !== normalizedAttachmentId
      ) {
        continue;
      }
      surface.attachmentId = null;
      detachNativeView(surface);
      publishSurfaceState(surface);
      detached = true;
    }
    return { ok: detached };
  }

  function runCommand({ surfaceId, command, callerWebContentsId }) {
    const surface = requireOwnedSurface(surfaceId, callerWebContentsId);
    if (!surface) return { ok: false };
    const navigation = getNavigationHistory(surface.view.webContents);
    switch (command) {
      case "back":
        if (navigation.canGoBack()) navigation.goBack();
        break;
      case "forward":
        if (navigation.canGoForward()) navigation.goForward();
        break;
      case "reload":
        surface.view.webContents.reload?.();
        break;
      default:
        return { ok: false };
    }
    refreshNavigationState(surface);
    publishSurfaceState(surface);
    return { ok: true };
  }

  function destroyWorkspace(rootPath, ownerWebContentsId = null, reason = "workspace-closed") {
    let destroyed = false;
    for (const surface of Array.from(surfaces.values())) {
      if (
        surface.rootPath === rootPath &&
        (ownerWebContentsId == null || surface.ownerWebContentsId === ownerWebContentsId)
      ) {
        destroyed = destroySurface(surface.surfaceId, { reason }) || destroyed;
      }
    }
    return destroyed;
  }

  function destroyApp(rootPath, appPath, ownerWebContentsId = null, reason = "app-closed") {
    let destroyed = false;
    for (const surface of Array.from(surfaces.values())) {
      if (
        surface.rootPath === rootPath &&
        surface.appPath === appPath &&
        (ownerWebContentsId == null || surface.ownerWebContentsId === ownerWebContentsId)
      ) {
        destroyed = destroySurface(surface.surfaceId, { reason }) || destroyed;
      }
    }
    return destroyed;
  }

  function destroyOwner(ownerWebContentsId, reason = "owner-closed") {
    for (const surface of Array.from(surfaces.values())) {
      if (surface.ownerWebContentsId === ownerWebContentsId) {
        destroySurface(surface.surfaceId, { reason });
      }
    }
    releaseOwnerState(ownerWebContentsId);
    cancelledAttachments.delete(ownerWebContentsId);
  }

  function destroyAll(reason = "shutdown") {
    for (const surfaceId of Array.from(surfaces.keys())) {
      destroySurface(surfaceId, { reason });
    }
    for (const ownerWebContentsId of Array.from(ownerStates.keys())) {
      releaseOwnerState(ownerWebContentsId);
    }
    cancelledAttachments.clear();
  }

  function runtimeUnavailable({
    rootPath,
    appPath = null,
    ownerWebContentsIds = [],
    reason = "runtime-unavailable",
  }) {
    const owners = new Set(ownerWebContentsIds);
    for (const surface of Array.from(surfaces.values())) {
      if (surface.rootPath !== rootPath) continue;
      if (appPath != null && surface.appPath !== appPath) continue;
      if (owners.size > 0 && !owners.has(surface.ownerWebContentsId)) continue;
      destroySurface(surface.surfaceId, { reason });
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    destroyAll("disposed");
  }

  function createSurface(request, window) {
    const surfaceId = `app-surface-${randomUUID()}`;
    const partitionSession = sessionFromPartition(`temp:${surfaceId}`, { cache: true });
    configurePartitionSession(partitionSession);
    const view = new WebContentsView({
      webPreferences: {
        session: partitionSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: false,
        disableDialogs: true,
        safeDialogs: true,
        navigateOnDragDrop: false,
        autoplayPolicy: "document-user-activation-required",
        spellcheck: false,
      },
    });
    const surface = {
      surfaceId,
      surfaceKey: request.surfaceKey,
      rootPath: request.rootPath,
      runtimeId: request.runtimeId,
      appId: request.appId,
      appPath: request.appPath,
      ownerWebContentsId: request.ownerWebContentsId,
      window,
      view,
      partitionSession,
      requestedBounds: request.bounds,
      attachmentId: request.attachmentId,
      url: null,
      allowedOrigin: new URL(request.url).origin,
      title: "",
      status: "loading",
      message: null,
      canGoBack: false,
      canGoForward: false,
      attached: false,
    };
    surfaces.set(surfaceId, surface);
    surfaceIdsByApp.set(request.surfaceKey, surfaceId);
    ensureOwnerState(window, request.ownerWebContentsId).surfaceIds.add(surfaceId);
    installWebContentsPolicy(surface, {
      publish: () => publishSurfaceState(surface),
      fail: () => detachNativeView(surface),
      destroy: () => destroySurface(surfaceId, { reason: "renderer-gone" }),
    });
    view.setVisible?.(false);
    view.webContents?.setAudioMuted?.(true);
    return surface;
  }

  function destroySurface(surfaceId, { reason = "destroyed" } = {}) {
    const surface = surfaces.get(surfaceId);
    if (!surface) return false;
    surfaces.delete(surfaceId);
    if (surfaceIdsByApp.get(surface.surfaceKey) === surfaceId) {
      surfaceIdsByApp.delete(surface.surfaceKey);
    }
    const ownerState = ownerStates.get(surface.ownerWebContentsId);
    ownerState?.surfaceIds.delete(surfaceId);
    detachNativeView(surface);
    try {
      closeWebContents(surface.view.webContents);
    } catch {
      // Ignore native teardown races.
    }
    cleanupPartitionSession(surface.partitionSession);
    if (ownerState?.surfaceIds.size === 0) releaseOwnerState(surface.ownerWebContentsId);
    publishState({
      ...serializeSurface(surface),
      status: "destroyed",
      attached: false,
      message: reason,
    }, surface.ownerWebContentsId);
    return true;
  }

  function attachNativeView(surface) {
    requireOwnerWindow(surface.ownerWebContentsId);
    for (const candidate of surfaces.values()) {
      if (
        candidate.surfaceId !== surface.surfaceId &&
        candidate.ownerWebContentsId === surface.ownerWebContentsId &&
        candidate.attached
      ) {
        candidate.attachmentId = null;
        detachNativeView(candidate);
        publishSurfaceState(candidate);
      }
    }
    if (!surface.attached) {
      surface.window.contentView.addChildView(surface.view);
      surface.attached = true;
    }
    applySurfaceBounds(surface);
  }

  function detachNativeView(surface) {
    if (surface.attached) {
      try {
        if (!surface.window?.isDestroyed?.()) {
          surface.window.contentView?.removeChildView?.(surface.view);
        }
      } catch {
        // Ignore view/window teardown races.
      }
    }
    surface.attached = false;
    try {
      surface.view.setVisible?.(false);
      surface.view.webContents?.setAudioMuted?.(true);
    } catch {
      // Ignore native visibility races.
    }
  }

  function applySurfaceBounds(surface) {
    let clipped = null;
    try {
      clipped = clipBoundsToOwner(surface.requestedBounds, surface.window);
    } catch {
      clipped = null;
    }
    const ownerVisible =
      !surface.window?.isDestroyed?.() &&
      (typeof surface.window.isVisible !== "function" || surface.window.isVisible()) &&
      (typeof surface.window.isMinimized !== "function" || !surface.window.isMinimized());
    const visible = Boolean(surface.attached && surface.attachmentId && clipped && ownerVisible);
    try {
      if (clipped) surface.view.setBounds(clipped);
      surface.view.setVisible?.(visible);
      surface.view.webContents?.setAudioMuted?.(!visible);
    } catch {
      return false;
    }
    return visible;
  }

  function ensureOwnerState(window, ownerWebContentsId) {
    const existing = ownerStates.get(ownerWebContentsId);
    if (existing) return existing;
    const state = { window, ownerWebContentsId, surfaceIds: new Set(), listeners: [] };
    ownerStates.set(ownerWebContentsId, state);
    const listen = (emitter, eventName, listener) => {
      if (typeof emitter?.on !== "function") return;
      emitter.on(eventName, listener);
      state.listeners.push([emitter, eventName, listener]);
    };
    const close = () => destroyOwner(ownerWebContentsId);
    const sync = () => {
      for (const surfaceId of state.surfaceIds) {
        const surface = surfaces.get(surfaceId);
        if (surface) applySurfaceBounds(surface);
      }
    };
    const hide = () => {
      for (const surfaceId of state.surfaceIds) {
        const surface = surfaces.get(surfaceId);
        if (!surface) continue;
        try {
          surface.view.setVisible?.(false);
          surface.view.webContents?.setAudioMuted?.(true);
        } catch {
          // Ignore visibility races.
        }
      }
    };
    listen(window, "closed", close);
    listen(window, "hide", hide);
    listen(window, "minimize", hide);
    listen(window, "resize", sync);
    listen(window, "show", sync);
    listen(window, "restore", sync);
    listen(window.webContents, "destroyed", close);
    listen(window.webContents, "render-process-gone", close);
    return state;
  }

  function releaseOwnerState(ownerWebContentsId) {
    const state = ownerStates.get(ownerWebContentsId);
    if (!state) return;
    ownerStates.delete(ownerWebContentsId);
    for (const [emitter, eventName, listener] of state.listeners) {
      try {
        emitter.removeListener?.(eventName, listener);
      } catch {
        // Ignore owner teardown races.
      }
    }
  }

  function requireOwnerWindow(ownerWebContentsId) {
    if (!Number.isSafeInteger(ownerWebContentsId) || ownerWebContentsId <= 0) {
      throw new Error("App preview owner is invalid.");
    }
    const window = getOwnerWindow(ownerWebContentsId);
    if (
      !window ||
      window.isDestroyed?.() ||
      !window.webContents ||
      window.webContents.id !== ownerWebContentsId ||
      window.webContents.isDestroyed?.()
    ) {
      throw new Error("App preview owner window is unavailable.");
    }
    getOwnerViewport(window);
    return window;
  }

  function requireOwnedSurface(surfaceId, callerWebContentsId) {
    if (typeof surfaceId !== "string" || !surfaceId) return null;
    const surface = surfaces.get(surfaceId);
    if (!surface || surface.ownerWebContentsId !== callerWebContentsId) return null;
    return surface;
  }

  function getAppSurface(surfaceKey) {
    const surfaceId = surfaceIdsByApp.get(surfaceKey);
    return surfaceId ? surfaces.get(surfaceId) ?? null : null;
  }

  function publishSurfaceState(surface) {
    if (surfaces.get(surface.surfaceId) !== surface) return;
    try {
      publishState(serializeSurface(surface), surface.ownerWebContentsId);
    } catch {
      // Renderer notifications are best effort.
    }
  }

  function serializeAppOperation(surfaceKey, operation) {
    const previous = pendingByApp.get(surfaceKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    pendingByApp.set(surfaceKey, current);
    return current.finally(() => {
      if (pendingByApp.get(surfaceKey) === current) pendingByApp.delete(surfaceKey);
    });
  }

  function markCancelledAttachment(ownerWebContentsId, attachmentId) {
    if (!Number.isSafeInteger(ownerWebContentsId) || ownerWebContentsId <= 0) return;
    const values = cancelledAttachments.get(ownerWebContentsId) ?? new Map();
    values.delete(attachmentId);
    values.set(attachmentId, Date.now());
    while (values.size > MAX_CANCELLED_ATTACHMENTS) {
      values.delete(values.keys().next().value);
    }
    cancelledAttachments.set(ownerWebContentsId, values);
  }

  function consumeCancelledAttachment(ownerWebContentsId, attachmentId) {
    const values = cancelledAttachments.get(ownerWebContentsId);
    if (!values?.has(attachmentId)) return false;
    values.delete(attachmentId);
    if (values.size === 0) cancelledAttachments.delete(ownerWebContentsId);
    return true;
  }

  function assertNotDisposed() {
    if (disposed) throw new Error("App preview browser surface manager is disposed.");
  }

  return {
    activate,
    setBounds,
    detach,
    runCommand,
    destroyApp,
    destroyWorkspace,
    destroyOwner,
    destroyAll,
    runtimeUnavailable,
    dispose,
  };
}

function normalizeActivationRequest(request) {
  const rootPath = requireString(request?.rootPath, "Workspace root path");
  const appId = requireString(request?.appId, "App id");
  const appPath = requireString(request?.appPath, "App path");
  const runtimeId = requireString(request?.runtimeId, "Runtime id");
  const attachmentId = normalizeAttachmentId(request?.attachmentId);
  const ownerWebContentsId = request?.ownerWebContentsId;
  if (!Number.isSafeInteger(ownerWebContentsId) || ownerWebContentsId <= 0) {
    throw new Error("App preview owner is invalid.");
  }
  const url = normalizeLocalAppUrl(request?.url);
  return {
    rootPath,
    appId,
    appPath,
    runtimeId,
    attachmentId,
    ownerWebContentsId,
    url,
    bounds: normalizeBounds(request?.bounds, { allowHidden: false }),
    surfaceKey: `${ownerWebContentsId}\n${rootPath}\n${appPath}`,
  };
}

function normalizeLocalAppUrl(value) {
  const url = new URL(requireString(value, "App preview URL"));
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") ||
    !url.port ||
    url.username ||
    url.password
  ) {
    throw new Error("App preview browser URL must use an explicit localhost port.");
  }
  return url.toString();
}

function normalizeAttachmentId(value) {
  const attachmentId = requireString(value, "App preview attachment id");
  if (attachmentId.length > 200) throw new Error("App preview attachment id is too long.");
  return attachmentId;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function normalizeBounds(bounds, { allowHidden }) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
    throw new Error("App preview bounds are required.");
  }
  const values = [bounds.x, bounds.y, bounds.width, bounds.height];
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("App preview bounds must contain finite numbers.");
  }
  if (bounds.width < 0 || bounds.height < 0 || (!allowHidden && (!bounds.width || !bounds.height))) {
    throw new Error("App preview bounds have an invalid size.");
  }
  return {
    x: Math.floor(bounds.x),
    y: Math.floor(bounds.y),
    width: Math.ceil(bounds.width),
    height: Math.ceil(bounds.height),
  };
}

function clipBoundsToOwner(bounds, window) {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const viewport = getOwnerViewport(window);
  const left = Math.max(0, bounds.x);
  const top = Math.max(0, bounds.y);
  const right = Math.min(viewport.width, bounds.x + bounds.width);
  const bottom = Math.min(viewport.height, bounds.y + bounds.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function getOwnerViewport(window) {
  const bounds = window.getContentBounds?.();
  let width = Number(bounds?.width);
  let height = Number(bounds?.height);
  if ((!Number.isFinite(width) || !Number.isFinite(height)) && window.getContentSize) {
    const size = window.getContentSize();
    width = Number(size?.[0]);
    height = Number(size?.[1]);
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("App preview owner viewport is unavailable.");
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

function closeWebContents(webContents) {
  if (!webContents || webContents.isDestroyed?.()) return;
  if (typeof webContents.close === "function") {
    webContents.close({ waitForBeforeUnload: false });
    return;
  }
  webContents.destroy?.();
}

function configurePartitionSession(partitionSession) {
  partitionSession.setPermissionRequestHandler?.((_webContents, _permission, callback) => callback(false));
  partitionSession.setPermissionCheckHandler?.(() => false);
  partitionSession.on?.("will-download", (event) => event.preventDefault());
}

function cleanupPartitionSession(partitionSession) {
  try {
    partitionSession.setPermissionRequestHandler?.(null);
    partitionSession.setPermissionCheckHandler?.(null);
    partitionSession.webRequest?.onBeforeRequest?.(null);
    void partitionSession.closeAllConnections?.().catch?.(() => undefined);
    void partitionSession.clearStorageData?.().catch?.(() => undefined);
  } catch {
    // Ignore ephemeral session cleanup races.
  }
}

function installWebContentsPolicy(surface, { publish, fail, destroy }) {
  const { webContents } = surface.view;
  webContents.setWindowOpenHandler?.(() => ({ action: "deny" }));
  const guardNavigation = (event, href) => {
    if (!isAllowedTopLevelNavigation(href, surface.allowedOrigin)) event.preventDefault();
  };
  webContents.on?.("will-navigate", guardNavigation);
  webContents.on?.("will-redirect", guardNavigation);
  webContents.on?.("will-attach-webview", (event) => event.preventDefault());
  webContents.on?.("login", (event) => event.preventDefault());
  webContents.on?.("did-start-loading", () => {
    surface.status = "loading";
    publish();
  });
  webContents.on?.("did-finish-load", () => {
    surface.status = "ready";
    surface.message = null;
    refreshNavigationState(surface);
    publish();
  });
  webContents.on?.("did-fail-load", (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame === false || code === -3) return;
    surface.status = "error";
    surface.message = description || `Page load failed (${code}).`;
    fail();
    publish();
  });
  webContents.on?.("did-navigate", () => {
    refreshNavigationState(surface);
    publish();
  });
  webContents.on?.("did-navigate-in-page", () => {
    refreshNavigationState(surface);
    publish();
  });
  webContents.on?.("page-title-updated", (_event, title) => {
    surface.title = typeof title === "string" ? title.slice(0, 200) : "";
    publish();
  });
  webContents.on?.("render-process-gone", destroy);
  webContents.on?.("unresponsive", destroy);
}

function isAllowedTopLevelNavigation(href, allowedOrigin) {
  try {
    const url = new URL(href);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.origin === allowedOrigin
    );
  } catch {
    return false;
  }
}

function getNavigationHistory(webContents) {
  const history = webContents.navigationHistory;
  return {
    canGoBack: () => Boolean(history?.canGoBack?.() ?? webContents.canGoBack?.()),
    canGoForward: () => Boolean(history?.canGoForward?.() ?? webContents.canGoForward?.()),
    goBack: () => history?.goBack?.() ?? webContents.goBack?.(),
    goForward: () => history?.goForward?.() ?? webContents.goForward?.(),
  };
}

function refreshNavigationState(surface) {
  const navigation = getNavigationHistory(surface.view.webContents);
  surface.canGoBack = navigation.canGoBack();
  surface.canGoForward = navigation.canGoForward();
  try {
    surface.title = surface.view.webContents.getTitle?.() || surface.title;
    const currentUrl = surface.view.webContents.getURL?.();
    if (currentUrl && isAllowedTopLevelNavigation(currentUrl, surface.allowedOrigin)) {
      surface.url = currentUrl;
    }
  } catch {
    // Ignore navigation teardown races.
  }
}

function serializeSurface(surface) {
  return {
    surfaceId: surface.surfaceId,
    runtimeId: surface.runtimeId,
    appId: surface.appId,
    path: surface.appPath,
    rootPath: surface.rootPath,
    status: surface.status,
    url: surface.url,
    title: surface.title || null,
    canGoBack: surface.canGoBack,
    canGoForward: surface.canGoForward,
    attached: surface.attached,
    message: surface.message,
  };
}

async function loadUrlWithTimeout(webContents, href, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        webContents.stop?.();
      } catch {
        // Caller handles teardown.
      }
      reject(new Error("App preview page load timed out."));
    }, timeoutMs);
  });
  try {
    await Promise.race([Promise.resolve(webContents.loadURL(href)), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}
