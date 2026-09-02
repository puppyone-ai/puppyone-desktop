import { randomUUID } from "node:crypto";
import { getPresetViewerDefinitionForViewerId } from "../viewer-packs/preset-viewer-manifest.mjs";

const ALLOWED_RESOURCE_PROTOCOLS = new Set(["puppyone-local:", "https:"]);
const APPEARANCE_ATTRIBUTE_PATTERN = /^data-[a-z0-9-]{1,80}$/;
const APPEARANCE_VARIABLE_PATTERN = /^--po-[a-z0-9-]{1,80}$/;
const UNRESPONSIVE_TIMEOUT_MS = 12_000;
const NAVIGATION_TIMEOUT_MS = 15_000;
const BOOTSTRAP_TIMEOUT_MS = 10_000;
const FIRST_FRAME_TIMEOUT_MS = 60_000;
const MAX_SESSIONS_PER_OWNER = 8;
const MAX_SESSIONS_TOTAL = 24;

/** Owns one sandboxed built-in Viewer runtime per committed Editor pane. */
export function createEditorSurfaceSessionManager({
  WebContentsView,
  sessionFromPartition,
  getOwnerWindow,
  preloadPath,
  surfaceUrl,
  configurePartition,
  nativeSurfaceOcclusion = null,
  nativeSurfacePointerPassthrough = null,
  navigationTimeoutMs = NAVIGATION_TIMEOUT_MS,
  bootstrapTimeoutMs = BOOTSTRAP_TIMEOUT_MS,
  firstFrameTimeoutMs = FIRST_FRAME_TIMEOUT_MS,
  onStateChange = null,
  logger = console,
}) {
  const sessions = new Map();

  function publish(entry, status, details = {}) {
    entry.status = status;
    const event = {
      sessionId: entry.sessionId,
      viewerId: entry.viewerId,
      status,
      ...details,
    };
    try {
      onStateChange?.(event);
    } catch (error) {
      logger.warn?.("Editor Surface state observer failed:", error);
    }
    if (entry.window?.isDestroyed?.() || entry.window?.webContents?.isDestroyed?.()) return;
    entry.window.webContents.send("editor-surface:state", event);
  }

  function destroySession(sessionId, { reason = "disposed", publishDisposed = false } = {}) {
    const entry = sessions.get(sessionId);
    if (!entry) return false;
    sessions.delete(sessionId);
    if (entry.unresponsiveTimer) clearTimeout(entry.unresponsiveTimer);
    if (entry.navigationTimer) clearTimeout(entry.navigationTimer);
    if (entry.bootstrapTimer) clearTimeout(entry.bootstrapTimer);
    if (entry.firstFrameTimer) clearTimeout(entry.firstFrameTimer);
    entry.unresponsiveTimer = null;
    entry.navigationTimer = null;
    entry.bootstrapTimer = null;
    entry.firstFrameTimer = null;
    entry.releaseOcclusion?.();
    entry.releasePointerPassthrough?.();
    entry.releasePartition?.();
    for (const [emitter, eventName, listener] of entry.listeners) {
      try {
        emitter.removeListener?.(eventName, listener);
      } catch {
        // Native teardown may race process termination.
      }
    }
    entry.listeners = [];
    try {
      entry.view.setVisible?.(false);
      entry.view.webContents?.setAudioMuted?.(true);
    } catch {
      // Ignore a renderer that already exited.
    }
    try {
      if (!entry.window.isDestroyed() && entry.window.contentView) {
        entry.window.contentView.removeChildView(entry.view);
      }
    } catch {
      // Ignore detach races.
    }
    try {
      entry.view.webContents?.destroy?.();
    } catch {
      // Ignore a renderer that already exited.
    }
    try {
      entry.partitionSession?.clearStorageData?.().catch?.(() => undefined);
    } catch {
      // Best-effort ephemeral partition cleanup.
    }
    if (publishDisposed) publish(entry, "disposed", { reason });
    return true;
  }

  function applyVisibility(entry) {
    const visible = entry.attached
      && entry.visible
      && !entry.occluded
      && entry.status !== "crashed"
      && entry.status !== "unresponsive";
    try {
      entry.view.setVisible?.(visible);
      entry.view.webContents?.setAudioMuted?.(!visible);
    } catch {
      // A dead renderer is handled by render-process-gone.
    }
  }

  function assertChild(sessionId, senderId) {
    const entry = sessions.get(sessionId);
    if (!entry || entry.view.webContents?.id !== senderId) return null;
    return entry;
  }

  function findChild(senderId) {
    return [...sessions.values()].find((entry) => entry.view.webContents?.id === senderId) ?? null;
  }

  function failPendingSession(entry, reason, message) {
    if (sessions.get(entry.sessionId) !== entry) return;
    publish(entry, "error", { reason, message });
    destroySession(entry.sessionId, { reason });
  }

  function armBootstrapTimeout(entry) {
    if (entry.bootstrapAcknowledged || entry.bootstrapTimer || sessions.get(entry.sessionId) !== entry) return;
    entry.bootstrapTimer = setTimeout(() => {
      entry.bootstrapTimer = null;
      failPendingSession(
        entry,
        "bootstrap-timeout",
        "Editor Surface did not request its bootstrap state.",
      );
    }, bootstrapTimeoutMs);
    entry.bootstrapTimer.unref?.();
  }

  async function navigate(entry) {
    const timeout = new Promise((_, reject) => {
      entry.navigationTimer = setTimeout(() => {
        entry.navigationTimer = null;
        const error = new Error("Editor Surface navigation timed out.");
        error.code = "navigation-timeout";
        reject(error);
      }, navigationTimeoutMs);
      entry.navigationTimer.unref?.();
    });
    try {
      await Promise.race([entry.view.webContents.loadURL(surfaceUrl), timeout]);
    } finally {
      if (entry.navigationTimer) clearTimeout(entry.navigationTimer);
      entry.navigationTimer = null;
    }
  }

  function armFirstFrameTimeout(entry) {
    if (entry.firstFrameTimer || entry.status === "ready" || sessions.get(entry.sessionId) !== entry) return;
    entry.firstFrameTimer = setTimeout(() => {
      entry.firstFrameTimer = null;
      failPendingSession(
        entry,
        "first-frame-timeout",
        "Editor Surface did not produce a first frame in time.",
      );
    }, firstFrameTimeoutMs);
    entry.firstFrameTimer.unref?.();
  }

  return Object.freeze({
    async activate(request) {
      const ownerWebContentsId = requirePositiveInteger(
        request?.ownerWebContentsId,
        "Editor Surface owner is invalid.",
      );
      const window = getOwnerWindow(ownerWebContentsId);
      if (!window || window.isDestroyed()) throw new Error("Editor Surface owner is unavailable.");
      if (sessions.size >= MAX_SESSIONS_TOTAL) {
        throw new Error("Editor Surface process budget is exhausted.");
      }
      const ownerSessionCount = [...sessions.values()].filter(
        (entry) => entry.ownerWebContentsId === ownerWebContentsId,
      ).length;
      if (ownerSessionCount >= MAX_SESSIONS_PER_OWNER) {
        throw new Error("This window has reached its Editor Surface process budget.");
      }
      const viewerId = requireString(request?.viewerId, "Editor Surface Viewer id is required.", 100);
      const definition = getPresetViewerDefinitionForViewerId(viewerId);
      if (definition.id !== viewerId || definition.executionIsolation !== "isolated-webcontents") {
        throw new Error(`Preset Viewer ${viewerId} is not admitted to an isolated runtime.`);
      }
      const resourceUrl = normalizeResourceUrl(request?.resourceUrl);
      const title = requireString(request?.title, "Editor Surface title is required.", 500);
      const bounds = normalizeBounds(request?.bounds, window);
      const appearance = normalizeAppearance(request?.appearance);
      const safeMode = request?.safeMode === true && definition.recoveryPolicy.supportsSafeMode;
      const sessionId = `bes_${randomUUID()}`;
      const partition = `temp:built-in-editor-${sessionId}`;
      const partitionSession = sessionFromPartition(partition, { cache: false });
      const releasePartition = configurePartition?.({
        partitionSession,
        applicationUrl: surfaceUrl,
      }) ?? null;
      partitionSession.setPermissionRequestHandler?.((_webContents, _permission, callback) => callback(false));
      partitionSession.setPermissionCheckHandler?.(() => false);

      const view = new WebContentsView({
        webPreferences: {
          session: partitionSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false,
          webSecurity: true,
          webviewTag: false,
          spellcheck: false,
          devTools: false,
          backgroundThrottling: false,
          preload: preloadPath,
        },
      });
      const entry = {
        sessionId,
        viewerId,
        documentPath: requireString(request?.documentPath, "Document path is required.", 4_096),
        documentRevision: typeof request?.documentRevision === "string"
          ? request.documentRevision.slice(0, 500)
          : null,
        resourceUrl,
        title,
        safeMode,
        resourcePolicy: definition.resourcePolicy,
        appearance,
        ownerWebContentsId,
        window,
        view,
        partitionSession,
        releasePartition,
        requestedBounds: bounds,
        attached: false,
        visible: true,
        occluded: false,
        status: "creating",
        listeners: [],
        releaseOcclusion: null,
        releasePointerPassthrough: null,
        unresponsiveTimer: null,
        navigationTimer: null,
        bootstrapTimer: null,
        firstFrameTimer: null,
        bootstrapAcknowledged: false,
        statusBeforeUnresponsive: null,
      };
      sessions.set(sessionId, entry);
      view.setBounds(bounds);
      view.setVisible?.(false);
      view.webContents?.setAudioMuted?.(true);
      installNavigationGuard(view.webContents, surfaceUrl);

      entry.releaseOcclusion = nativeSurfaceOcclusion?.register?.({
        ownerWebContentsId,
        setOccluded: (occluded) => {
          entry.occluded = occluded;
          if (sessions.get(sessionId) === entry) applyVisibility(entry);
        },
      }) ?? null;
      entry.releasePointerPassthrough = nativeSurfacePointerPassthrough?.register?.({
        ownerWebContentsId,
        ownerWebContents: window.webContents,
        surfaceView: view,
      }) ?? null;
      window.contentView.addChildView(view);
      entry.attached = true;
      applyVisibility(entry);

      listen(entry, window, "closed", () => destroySession(sessionId, { reason: "owner-closed" }));
      listen(entry, window, "hide", () => {
        entry.visible = false;
        applyVisibility(entry);
      });
      listen(entry, window, "show", () => {
        entry.visible = true;
        applyVisibility(entry);
      });
      listen(entry, view.webContents, "render-process-gone", (_event, details) => {
        publish(entry, "crashed", {
          reason: normalizeGoneReason(details?.reason),
          exitCode: Number.isSafeInteger(details?.exitCode) ? details.exitCode : null,
        });
        destroySession(sessionId, { reason: "render-process-gone" });
      });
      listen(entry, view.webContents, "unresponsive", () => {
        if (entry.status !== "unresponsive") entry.statusBeforeUnresponsive = entry.status;
        publish(entry, "unresponsive");
        applyVisibility(entry);
        entry.unresponsiveTimer = setTimeout(() => {
          if (sessions.get(sessionId) !== entry || entry.status !== "unresponsive") return;
          try {
            entry.view.webContents.forcefullyCrashRenderer();
          } catch (error) {
            logger.warn?.("Unable to terminate unresponsive Editor Surface:", error);
          }
        }, UNRESPONSIVE_TIMEOUT_MS);
      });
      listen(entry, view.webContents, "responsive", () => {
        if (entry.unresponsiveTimer) clearTimeout(entry.unresponsiveTimer);
        entry.unresponsiveTimer = null;
        const recoveredStatus = entry.statusBeforeUnresponsive === "ready" ? "ready" : "loading";
        entry.statusBeforeUnresponsive = null;
        publish(entry, recoveredStatus);
        applyVisibility(entry);
      });

      publish(entry, "loading");
      try {
        await navigate(entry);
        if (sessions.get(sessionId) !== entry) throw new Error("Editor Surface was disposed while loading.");
        armBootstrapTimeout(entry);
      } catch (error) {
        if (sessions.get(sessionId) !== entry) throw error;
        const navigationTimedOut = error?.code === "navigation-timeout";
        publish(entry, navigationTimedOut ? "error" : "crashed", {
          reason: navigationTimedOut ? "navigation-timeout" : "launch-failed",
          message: normalizeMessage(error),
        });
        destroySession(sessionId, { reason: "launch-failed" });
        throw error;
      }

      return {
        sessionId,
        viewerId,
        safeMode,
        processId: view.webContents.getOSProcessId?.() ?? null,
        status: entry.status,
      };
    },

    setBounds(sessionId, bounds, ownerWebContentsId) {
      const entry = sessions.get(sessionId);
      if (!entry || entry.ownerWebContentsId !== ownerWebContentsId) return { ok: false };
      entry.requestedBounds = normalizeBounds(bounds, entry.window);
      entry.view.setBounds(entry.requestedBounds);
      applyVisibility(entry);
      return { ok: true };
    },

    updateAppearance(sessionId, appearance, ownerWebContentsId) {
      const entry = sessions.get(sessionId);
      if (!entry || entry.ownerWebContentsId !== ownerWebContentsId) return { ok: false };
      entry.appearance = normalizeAppearance(appearance);
      if (!entry.view.webContents.isDestroyed()) {
        entry.view.webContents.send("editor-surface:appearance", entry.appearance);
      }
      return { ok: true };
    },

    getBootstrapForChild(senderId) {
      const entry = findChild(senderId);
      if (!entry) throw new Error("Untrusted Editor Surface bootstrap request.");
      entry.bootstrapAcknowledged = true;
      if (entry.bootstrapTimer) clearTimeout(entry.bootstrapTimer);
      entry.bootstrapTimer = null;
      armFirstFrameTimeout(entry);
      return {
        sessionId: entry.sessionId,
        viewerId: entry.viewerId,
        resourceUrl: entry.resourceUrl,
        title: entry.title,
        safeMode: entry.safeMode,
        resourcePolicy: entry.resourcePolicy,
        appearance: entry.appearance,
      };
    },

    destroy(sessionId, ownerWebContentsId) {
      const entry = sessions.get(sessionId);
      if (!entry || entry.ownerWebContentsId !== ownerWebContentsId) return { ok: false };
      return { ok: destroySession(sessionId) };
    },

    reportReady(sessionId, senderId) {
      const entry = assertChild(sessionId, senderId);
      if (!entry) return false;
      if (entry.firstFrameTimer) clearTimeout(entry.firstFrameTimer);
      entry.firstFrameTimer = null;
      publish(entry, "ready");
      applyVisibility(entry);
      return true;
    },

    reportError(sessionId, senderId, request) {
      const entry = assertChild(sessionId, senderId);
      if (!entry) return false;
      if (entry.bootstrapTimer) clearTimeout(entry.bootstrapTimer);
      if (entry.firstFrameTimer) clearTimeout(entry.firstFrameTimer);
      entry.bootstrapTimer = null;
      entry.firstFrameTimer = null;
      publish(entry, "error", { message: normalizeMessage(request?.message) });
      entry.visible = false;
      applyVisibility(entry);
      return true;
    },

    hasChild(senderId) {
      return Boolean(findChild(senderId));
    },

    destroyForOwner(ownerWebContentsId) {
      for (const [sessionId, entry] of [...sessions.entries()]) {
        if (entry.ownerWebContentsId === ownerWebContentsId) {
          destroySession(sessionId, { reason: "owner-released" });
        }
      }
    },

    destroyAll() {
      for (const sessionId of [...sessions.keys()]) destroySession(sessionId);
    },

    values() {
      return [...sessions.values()];
    },

    broadcastLocale(state) {
      for (const entry of sessions.values()) {
        if (!entry.view.webContents.isDestroyed()) {
          entry.view.webContents.send("editor-surface:locale-changed", state);
        }
      }
    },
  });
}

function listen(entry, emitter, eventName, listener) {
  emitter.on?.(eventName, listener);
  entry.listeners.push([emitter, eventName, listener]);
}

function installNavigationGuard(webContents, applicationUrl) {
  const trusted = new URL(applicationUrl);
  webContents.setWindowOpenHandler?.(() => ({ action: "deny" }));
  webContents.on?.("will-navigate", (event, target) => {
    const next = new URL(target);
    if (next.protocol === trusted.protocol && next.origin === trusted.origin && next.pathname === trusted.pathname) {
      return;
    }
    event.preventDefault();
  });
}

function normalizeBounds(value, window) {
  const [contentWidth, contentHeight] = window.getContentSize?.() ?? [1, 1];
  const x = clampInteger(value?.x, 0, Math.max(0, contentWidth - 1));
  const y = clampInteger(value?.y, 0, Math.max(0, contentHeight - 1));
  return {
    x,
    y,
    width: clampInteger(value?.width, 1, Math.max(1, contentWidth - x)),
    height: clampInteger(value?.height, 1, Math.max(1, contentHeight - y)),
  };
}

function normalizeResourceUrl(value) {
  const raw = requireString(value, "Editor Surface resource URL is required.", 16_384);
  const parsed = new URL(raw);
  if (!ALLOWED_RESOURCE_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Editor Surface resource URL is not allowed.");
  }
  return parsed.toString();
}

function normalizeAppearance(value) {
  const attributes = {};
  const variables = {};
  for (const [name, raw] of Object.entries(value?.attributes ?? {}).slice(0, 32)) {
    if (APPEARANCE_ATTRIBUTE_PATTERN.test(name) && typeof raw === "string") {
      attributes[name] = raw.slice(0, 200);
    }
  }
  for (const [name, raw] of Object.entries(value?.variables ?? {}).slice(0, 128)) {
    if (APPEARANCE_VARIABLE_PATTERN.test(name) && typeof raw === "string") {
      variables[name] = raw.slice(0, 500);
    }
  }
  return Object.freeze({
    dark: value?.dark === true,
    direction: value?.direction === "rtl" ? "rtl" : "ltr",
    attributes: Object.freeze(attributes),
    variables: Object.freeze(variables),
  });
}

function normalizeGoneReason(value) {
  return typeof value === "string" && value.length <= 80 ? value : "unknown";
}

function normalizeMessage(value) {
  const message = value instanceof Error ? value.message : String(value ?? "Editor Surface failed.");
  return message.slice(0, 1_000);
}

function requireString(value, message, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(message);
  return value.trim();
}

function requirePositiveInteger(value, message) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(message);
  return value;
}

function clampInteger(value, minimum, maximum) {
  const normalized = Number.isFinite(value) ? Math.round(value) : minimum;
  return Math.min(maximum, Math.max(minimum, normalized));
}
