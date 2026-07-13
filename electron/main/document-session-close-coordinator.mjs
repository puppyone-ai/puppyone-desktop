import { randomUUID } from "node:crypto";

export const DOCUMENT_SESSION_FLUSH_REQUEST_CHANNEL = "document-session:flush-requested";
export const DOCUMENT_SESSION_FLUSH_RESULT_CHANNEL = "document-session:flush-result";
export const DOCUMENT_SESSION_CLOSE_CANCELLED_CHANNEL = "document-session:close-cancelled";

const DEFAULT_TIMEOUT_MS = 12_000;

/** Preserve app-quit intent across the asynchronous BrowserWindow close gate. */
export function createApplicationQuitIntent({ app, platform = process.platform }) {
  if (!app || typeof app.quit !== "function") {
    throw new TypeError("An Electron app implementation is required.");
  }
  let requested = false;
  return Object.freeze({
    markRequested: () => {
      requested = true;
    },
    cancel: () => {
      requested = false;
    },
    resumeAfterLastWindowClosed: () => {
      if (platform !== "darwin" || requested) app.quit();
    },
  });
}

/**
 * Coordinates BrowserWindow close with the renderer-owned Document Sessions.
 * The renderer owns editor snapshots; Main owns the final close decision.
 */
export function createDocumentSessionCloseCoordinator({
  dialog,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console,
  onCloseCancelled = () => undefined,
}) {
  if (!dialog || typeof dialog.showMessageBox !== "function") {
    throw new TypeError("A dialog implementation is required.");
  }

  const pendingRequests = new Map();
  const windowStates = new WeakMap();

  function registerIpc(ipc) {
    if (!ipc || typeof ipc.on !== "function") {
      throw new TypeError("A trusted IPC registrar is required.");
    }
    ipc.on(DOCUMENT_SESSION_FLUSH_RESULT_CHANNEL, (event, payload) => {
      const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
      const pending = requestId ? pendingRequests.get(requestId) : null;
      if (!pending || event?.sender?.id !== pending.webContentsId) return;

      pendingRequests.delete(requestId);
      clearTimeout(pending.timer);
      pending.resolve(payload?.ok === true
        ? { ok: true, error: null }
        : { ok: false, error: sanitizeError(payload?.error) });
    });
  }

  function attachWindow(window) {
    if (!window || typeof window.on !== "function" || !window.webContents) {
      throw new TypeError("A BrowserWindow is required.");
    }
    if (windowStates.has(window)) return () => undefined;

    const state = {
      allowClose: false,
      closeInProgress: false,
      rendererReady: false,
      requestId: null,
    };
    windowStates.set(window, state);

    const markRendererReady = () => {
      state.rendererReady = true;
    };
    const markRendererUnavailable = () => {
      state.rendererReady = false;
    };
    const markRendererLoading = (details, _url, _isInPlace, legacyIsMainFrame) => {
      const isMainFrame = typeof details?.isMainFrame === "boolean"
        ? details.isMainFrame
        : legacyIsMainFrame;
      const isSameDocument = details?.isSameDocument === true;
      if (isMainFrame && !isSameDocument) state.rendererReady = false;
    };
    const handleClose = (event) => {
      if (state.allowClose || !state.rendererReady || window.webContents.isDestroyed()) return;
      event.preventDefault();
      if (state.closeInProgress) return;

      state.closeInProgress = true;
      void finishInterceptedClose(window, state).catch((error) => {
        state.closeInProgress = false;
        onCloseCancelled(window);
        logger.error?.("Unable to coordinate document flush before closing:", error);
      });
    };
    const handleClosed = () => {
      cancelPendingRequest(state, "The window closed before its documents were saved.");
      cleanup();
    };
    const cleanup = () => {
      window.removeListener?.("close", handleClose);
      window.removeListener?.("closed", handleClosed);
      window.webContents.removeListener?.("did-finish-load", markRendererReady);
      window.webContents.removeListener?.("did-start-navigation", markRendererLoading);
      window.webContents.removeListener?.("render-process-gone", markRendererUnavailable);
      windowStates.delete(window);
    };

    window.webContents.on("did-finish-load", markRendererReady);
    window.webContents.on("did-start-navigation", markRendererLoading);
    window.webContents.on("render-process-gone", markRendererUnavailable);
    window.on("close", handleClose);
    window.on("closed", handleClosed);

    return cleanup;
  }

  async function finishInterceptedClose(window, state) {
    const result = await requestRendererFlush(window, state);
    if (result.ok) {
      state.allowClose = true;
      if (!window.isDestroyed()) window.close();
      return;
    }

    if (window.isDestroyed()) return;
    let choice;
    try {
      choice = await dialog.showMessageBox(window, {
        type: "warning",
        buttons: ["Keep Window Open", "Close Anyway"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        message: "Some document changes could not be saved.",
        detail: result.error ?? "Keep the window open and try again to avoid losing changes.",
      });
    } catch (error) {
      notifyRendererCloseCancelled(window, result.requestId);
      throw error;
    }
    if (choice.response === 1) {
      state.allowClose = true;
      if (!window.isDestroyed()) window.close();
      return;
    }
    notifyRendererCloseCancelled(window, result.requestId);
    state.closeInProgress = false;
    onCloseCancelled(window);
  }

  function requestRendererFlush(window, state) {
    const requestId = randomUUID();
    state.requestId = requestId;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        if (state.requestId === requestId) state.requestId = null;
        resolve({
          ok: false,
          error: "Saving open documents timed out. Keep the window open and try again.",
          requestId,
        });
      }, normalizeTimeout(timeoutMs));
      pendingRequests.set(requestId, {
        webContentsId: window.webContents.id,
        timer,
        resolve: (result) => {
          if (state.requestId === requestId) state.requestId = null;
          resolve({ ...result, requestId });
        },
      });

      try {
        window.webContents.send(DOCUMENT_SESSION_FLUSH_REQUEST_CHANNEL, { requestId });
      } catch (error) {
        const pending = pendingRequests.get(requestId);
        if (!pending) return;
        pendingRequests.delete(requestId);
        clearTimeout(timer);
        if (state.requestId === requestId) state.requestId = null;
        resolve({ ok: false, error: sanitizeError(error), requestId });
      }
    });
  }

  function cancelPendingRequest(state, message) {
    const requestId = state.requestId;
    if (!requestId) return;
    const pending = pendingRequests.get(requestId);
    state.requestId = null;
    if (!pending) return;
    pendingRequests.delete(requestId);
    clearTimeout(pending.timer);
    pending.resolve({ ok: false, error: message });
  }

  return Object.freeze({ attachWindow, registerIpc });
}

function notifyRendererCloseCancelled(window, requestId) {
  if (!requestId || window.isDestroyed() || window.webContents.isDestroyed()) return;
  try {
    window.webContents.send(DOCUMENT_SESSION_CLOSE_CANCELLED_CHANNEL, { requestId });
  } catch {
    // The window stays open by default; a missing renderer needs no further action.
  }
}

function normalizeTimeout(value) {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : DEFAULT_TIMEOUT_MS;
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "Unable to save open documents.");
  return message.slice(0, 500);
}
