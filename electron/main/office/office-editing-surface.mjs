import { randomUUID } from "node:crypto";

const LOAD_TIMEOUT_MS = 20_000;

/** Isolates the third-party Office runtime from the trusted application renderer. */
export function createOfficeEditingSurfaceManager({
  WebContentsView,
  sessionFromPartition,
  getOwnerWindow,
}) {
  const surfaces = new Map();
  const ownerStates = new Map();

  async function attach({ ownerId, sessionId, apiScriptUrl, editorConfig, bounds, attachmentId }) {
    const window = requireOwnerWindow(ownerId);
    const normalizedBounds = normalizeBounds(bounds);
    const normalizedAttachmentId = requireId(attachmentId, "Office surface attachment");
    const previous = [...surfaces.values()].find((surface) => (
      surface.ownerId === ownerId && surface.sessionId === sessionId
    ));
    if (previous) destroy(previous.surfaceId);

    const surfaceId = `office-surface-${randomUUID()}`;
    const partitionSession = sessionFromPartition(`temp:${surfaceId}`, { cache: false });
    const engineOrigin = new URL(requireHttpUrl(apiScriptUrl)).origin;
    configureSession(partitionSession, engineOrigin);
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
        spellcheck: true,
      },
    });
    const surface = {
      surfaceId,
      ownerId,
      sessionId,
      attachmentId: normalizedAttachmentId,
      window,
      view,
      partitionSession,
      requestedBounds: normalizedBounds,
      attached: false,
    };
    surfaces.set(surfaceId, surface);
    ensureOwnerState(ownerId, window).surfaceIds.add(surfaceId);
    installWebContentsPolicy(view.webContents);
    try {
      await loadOfficeHost(view.webContents, apiScriptUrl, editorConfig);
      if (!surfaces.has(surfaceId) || view.webContents.isDestroyed?.()) {
        throw new Error("Office surface closed while loading.");
      }
      window.contentView.addChildView(view);
      surface.attached = true;
      applyBounds(surface);
      return { surfaceId, attached: true };
    } catch (error) {
      destroy(surfaceId);
      throw error;
    }
  }

  function setBounds({ ownerId, surfaceId, attachmentId, bounds }) {
    const surface = requireOwnedSurface(ownerId, surfaceId, attachmentId);
    surface.requestedBounds = normalizeBounds(bounds, { allowHidden: true });
    return { ok: true, visible: applyBounds(surface) };
  }

  function detach({ ownerId, surfaceId, attachmentId }) {
    const surface = requireOwnedSurface(ownerId, surfaceId, attachmentId, { optional: true });
    return { detached: surface ? destroy(surface.surfaceId) : false };
  }

  function destroyOwner(ownerId) {
    for (const surface of [...surfaces.values()]) {
      if (surface.ownerId === ownerId) destroy(surface.surfaceId);
    }
    releaseOwnerState(ownerId);
  }

  function destroyAll() {
    for (const surfaceId of [...surfaces.keys()]) destroy(surfaceId);
    for (const ownerId of [...ownerStates.keys()]) releaseOwnerState(ownerId);
  }

  function destroy(surfaceId) {
    const surface = surfaces.get(surfaceId);
    if (!surface) return false;
    surfaces.delete(surfaceId);
    const ownerState = ownerStates.get(surface.ownerId);
    ownerState?.surfaceIds.delete(surfaceId);
    try {
      surface.view.setVisible?.(false);
      if (surface.attached && !surface.window.isDestroyed?.()) {
        surface.window.contentView.removeChildView?.(surface.view);
      }
    } catch {
      // Native teardown may race owner window destruction.
    }
    try {
      if (!surface.view.webContents.isDestroyed?.()) surface.view.webContents.close?.({ waitForBeforeUnload: false });
    } catch {
      try { surface.view.webContents.destroy?.(); } catch { /* ignored */ }
    }
    cleanupSession(surface.partitionSession);
    if (ownerState?.surfaceIds.size === 0) releaseOwnerState(surface.ownerId);
    return true;
  }

  function applyBounds(surface) {
    const viewport = getViewport(surface.window);
    const requested = surface.requestedBounds;
    const left = Math.max(0, requested.x);
    const top = Math.max(0, requested.y);
    const right = Math.min(viewport.width, requested.x + requested.width);
    const bottom = Math.min(viewport.height, requested.y + requested.height);
    const visible = right > left && bottom > top
      && (!surface.window.isVisible || surface.window.isVisible())
      && (!surface.window.isMinimized || !surface.window.isMinimized());
    if (visible) {
      surface.view.setBounds({ x: left, y: top, width: right - left, height: bottom - top });
    }
    surface.view.setVisible?.(visible);
    return visible;
  }

  function ensureOwnerState(ownerId, window) {
    const current = ownerStates.get(ownerId);
    if (current) return current;
    const state = { ownerId, window, surfaceIds: new Set(), listeners: [] };
    ownerStates.set(ownerId, state);
    const listen = (emitter, event, listener) => {
      emitter?.on?.(event, listener);
      state.listeners.push([emitter, event, listener]);
    };
    const sync = () => {
      for (const surfaceId of state.surfaceIds) {
        const surface = surfaces.get(surfaceId);
        if (surface) applyBounds(surface);
      }
    };
    listen(window, "resize", sync);
    listen(window, "show", sync);
    listen(window, "restore", sync);
    listen(window, "hide", sync);
    listen(window, "minimize", sync);
    listen(window, "closed", () => destroyOwner(ownerId));
    listen(window.webContents, "destroyed", () => destroyOwner(ownerId));
    return state;
  }

  function releaseOwnerState(ownerId) {
    const state = ownerStates.get(ownerId);
    if (!state || state.surfaceIds.size > 0) return;
    ownerStates.delete(ownerId);
    for (const [emitter, event, listener] of state.listeners) emitter?.removeListener?.(event, listener);
  }

  function requireOwnerWindow(ownerId) {
    const window = getOwnerWindow(ownerId);
    if (!window || window.isDestroyed?.() || window.webContents?.id !== ownerId || window.webContents?.isDestroyed?.()) {
      throw new Error("Office surface owner window is unavailable.");
    }
    getViewport(window);
    return window;
  }

  function requireOwnedSurface(ownerId, surfaceId, attachmentId, options = {}) {
    const surface = surfaces.get(surfaceId);
    if (
      !surface
      || surface.ownerId !== ownerId
      || surface.attachmentId !== requireId(attachmentId, "Office surface attachment")
    ) {
      if (options.optional) return null;
      throw new Error("Office surface is unavailable.");
    }
    return surface;
  }

  return Object.freeze({ attach, setBounds, detach, destroyOwner, destroyAll });
}

async function loadOfficeHost(webContents, apiScriptUrl, editorConfig) {
  const apiUrl = requireHttpUrl(apiScriptUrl);
  const parsedApiUrl = new URL(apiUrl);
  const origin = parsedApiUrl.origin;
  const webSocketOrigin = `${parsedApiUrl.protocol === "https:" ? "wss:" : "ws:"}//${parsedApiUrl.host}`;
  const csp = [
    "default-src 'none'",
    `script-src ${origin}`,
    `style-src ${origin} 'unsafe-inline'`,
    `img-src ${origin} data: blob:`,
    `font-src ${origin} data:`,
    `frame-src ${origin}`,
    `connect-src ${origin} ${webSocketOrigin}`,
  ].join("; ");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><style>html,body,#editor{width:100%;height:100%;margin:0;overflow:hidden}</style></head><body><div id="editor"></div><script src="${escapeHtml(apiUrl)}"></script></body></html>`;
  await withTimeout(webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`), LOAD_TIMEOUT_MS);
  const serializedConfig = JSON.stringify(editorConfig).replace(/[\u2028\u2029]/g, (character) => (
    character === "\u2028" ? "\\u2028" : "\\u2029"
  ));
  await withTimeout(webContents.executeJavaScript(`(() => {
    if (!window.DocsAPI || typeof window.DocsAPI.DocEditor !== "function") throw new Error("ONLYOFFICE API is unavailable.");
    const config = ${serializedConfig};
    window.__puppyoneOfficeEditor = new window.DocsAPI.DocEditor("editor", config);
    return true;
  })()`), LOAD_TIMEOUT_MS);
}

function installWebContentsPolicy(webContents) {
  webContents.setWindowOpenHandler?.(() => ({ action: "deny" }));
  webContents.on?.("will-attach-webview", (event) => event.preventDefault());
  webContents.on?.("will-navigate", (event) => event.preventDefault());
}

function configureSession(partitionSession, engineOrigin) {
  partitionSession.setPermissionRequestHandler?.((_webContents, _permission, callback) => callback(false));
  partitionSession.setPermissionCheckHandler?.(() => false);
  partitionSession.webRequest?.onBeforeRequest?.((details, callback) => {
    let allowed = false;
    try {
      const url = new URL(details.url);
      allowed = url.protocol === "data:" || url.protocol === "blob:" || url.origin === engineOrigin;
    } catch {
      allowed = false;
    }
    callback({ cancel: !allowed });
  });
}

function cleanupSession(partitionSession) {
  void partitionSession?.clearStorageData?.().catch?.(() => undefined);
  void partitionSession?.clearCache?.().catch?.(() => undefined);
  partitionSession?.setPermissionRequestHandler?.(null);
  partitionSession?.setPermissionCheckHandler?.(null);
  partitionSession?.webRequest?.onBeforeRequest?.(null);
}

function normalizeBounds(value, { allowHidden = false } = {}) {
  const result = {
    x: Math.round(Number(value?.x)),
    y: Math.round(Number(value?.y)),
    width: Math.round(Number(value?.width)),
    height: Math.round(Number(value?.height)),
  };
  if (!Object.values(result).every(Number.isSafeInteger) || result.width < (allowHidden ? 0 : 1) || result.height < (allowHidden ? 0 : 1)) {
    throw new Error("Office surface bounds are invalid.");
  }
  return result;
}

function getViewport(window) {
  const bounds = window.getContentBounds?.();
  if (!bounds || !Number.isSafeInteger(bounds.width) || !Number.isSafeInteger(bounds.height)) {
    throw new Error("Office surface owner viewport is unavailable.");
  }
  return bounds;
}

function requireId(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error(`${label} id is invalid.`);
  return value;
}

function requireHttpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("ONLYOFFICE API URL is invalid."); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("ONLYOFFICE API URL is not allowed.");
  }
  return url.toString();
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Office surface load timed out.")), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
