import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PLUGIN_PROTOCOL_SCHEME,
  registerPluginProtocol as defaultRegisterPluginProtocol,
} from "./plugin-protocol.mjs";
import {
  RESOURCE_PROTOCOL_SCHEME,
  registerResourceProtocol as defaultRegisterResourceProtocol,
} from "./resource-protocol.mjs";
import { buildPluginContentSecurityPolicy } from "./plugin-session-security.mjs";

/**
 * Plugin WebContentsView session manager.
 * One activated viewer instance per owner window + committed document.
 */

export function createViewerPackSessionManager({
  WebContentsView,
  sessionFromPartition,
  getOwnerWindow,
  pluginPreloadPath,
  store,
  registryService,
  resourceBroker,
  applyPluginSessionSecurity,
  registerPluginProtocol = defaultRegisterPluginProtocol,
  registerResourceProtocol = defaultRegisterResourceProtocol,
  getMimeType = null,
  // Production NEVER falls back to file://. Tests without a real Electron
  // protocol stack may opt into a file:// load to exercise session wiring.
  allowFileFallback = false,
}) {
  const sessions = new Map();

  function destroySession(sessionId, { reason = "destroyed" } = {}) {
    const entry = sessions.get(sessionId);
    if (!entry) return false;
    sessions.delete(sessionId);
    resourceBroker.revokeInstance(entry.instanceId);
    try {
      if (entry.window && !entry.window.isDestroyed() && entry.window.contentView) {
        entry.window.contentView.removeChildView(entry.view);
      }
    } catch {
      // ignore detach races
    }
    try {
      entry.view.webContents?.destroy?.();
    } catch {
      // ignore
    }
    try {
      entry.partitionSession?.clearStorageData?.().catch?.(() => undefined);
    } catch {
      // ignore
    }
    try {
      entry.partitionSession?.protocol?.unhandle?.(PLUGIN_PROTOCOL_SCHEME);
      entry.partitionSession?.protocol?.unhandle?.(RESOURCE_PROTOCOL_SCHEME);
      entry.partitionSession?.webRequest?.onBeforeRequest?.(null);
      entry.partitionSession?.setPermissionRequestHandler?.(null);
      entry.partitionSession?.setPermissionCheckHandler?.(null);
    } catch {
      // ignore partition teardown races
    }
    entry.reason = reason;
    return true;
  }

  return {
    async activate({
      pluginId,
      version,
      contentHash,
      entry,
      documentPath,
      documentName,
      documentMimeType,
      documentRevision,
      rootPath,
      relativePath,
      permissions,
      runtime,
      ownerWebContentsId,
      bounds,
    }) {
      const window = getOwnerWindow(ownerWebContentsId);
      if (!window || window.isDestroyed()) {
        throw new Error("Owner window unavailable for viewer pack session.");
      }

      // The desktop currently exposes one committed preview surface per owner
      // window. Replacing every prior owner session prevents hidden views and
      // stale document grants from surviving a document/workspace switch.
      for (const [id, existing] of Array.from(sessions.entries())) {
        if (existing.ownerWebContentsId === ownerWebContentsId) {
          destroySession(id, { reason: "replaced" });
        }
      }

      const instanceId = randomUUID();
      const sessionId = `vps_${instanceId}`;
      const partition = `temp:viewer-pack-${sessionId}`;
      const partitionSession = sessionFromPartition(partition, { cache: false });
      const declaredRuntime = Array.isArray(runtime) ? [...runtime] : [];
      const contentSecurityPolicy = buildPluginContentSecurityPolicy({
        allowWasm: declaredRuntime.includes("wasm"),
        allowWorker: declaredRuntime.includes("worker"),
      });
      applyPluginSessionSecurity(partitionSession, {
        pluginId,
        contentHash,
        allowFileFallback,
      });

      // Bind the pack + resource protocols to THIS session's partition, scoped
      // to this exact audience, before we ever navigate. A resource URL minted
      // here is only ever readable from this session.
      registerPluginProtocol({
        session: partitionSession,
        registryService,
        expectedPluginId: pluginId,
        expectedContentHash: contentHash,
        contentSecurityPolicy,
        getMimeType,
      });
      registerResourceProtocol({
        session: partitionSession,
        broker: resourceBroker,
        audience: { pluginId, instanceId, ownerWebContentsId },
        contentType: documentMimeType ?? "application/octet-stream",
      });

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
          webgl: declaredRuntime.includes("webgl") || declaredRuntime.includes("webgpu"),
          spellcheck: false,
          devTools: false,
          preload: pluginPreloadPath,
        },
      });

      const packageDir = store.packageContentDir(pluginId, version, contentHash);
      const entryPath = path.join(packageDir, entry);

      // Production always loads over the registered custom protocol so pack
      // assets stay bound to the session partition. No silent file:// fallback.
      const pluginOriginUrl = `puppyone-plugin://${pluginId}/${contentHash}/${entry}`;

      installViewNavigationSecurity(view.webContents, { pluginId, contentHash });
      view.setBounds(normalizeBounds(bounds, window));
      window.contentView.addChildView(view);

      const entryRecord = {
        sessionId,
        instanceId,
        pluginId,
        version,
        contentHash,
        documentPath,
        documentName,
        documentMimeType: documentMimeType ?? null,
        documentRevision: documentRevision ?? null,
        rootPath,
        relativePath,
        permissions: Object.freeze({
          currentDocument: Object.freeze([...(permissions?.currentDocument ?? [])]),
          relatedFiles: permissions?.relatedFiles ?? "none",
          network: Object.freeze([]),
        }),
        runtime: Object.freeze(declaredRuntime),
        ownerWebContentsId,
        window,
        view,
        partitionSession,
        packageDir,
      };
      sessions.set(sessionId, entryRecord);
      view.webContents?.once?.("render-process-gone", () => {
        destroySession(sessionId, { reason: "render-process-gone" });
      });

      try {
        await view.webContents.loadURL(pluginOriginUrl);
      } catch (error) {
        if (!allowFileFallback) {
          destroySession(sessionId, { reason: "load-failed" });
          throw error;
        }
        // Test-only path: no real protocol stack, load the extracted entry.
        await view.webContents.loadURL(pathToFileURL(entryPath).href);
      }

      return {
        sessionId,
        pluginId,
        version,
        contentHash,
        documentPath,
        ownerWebContentsId,
        instanceId,
      };
    },

    setBounds(sessionId, bounds, callerWebContentsId) {
      const entry = sessions.get(sessionId);
      if (!entry) return { ok: false };
      if (entry.ownerWebContentsId !== callerWebContentsId) return { ok: false };
      entry.view.setBounds(normalizeBounds(bounds, entry.window));
      return { ok: true };
    },

    destroy(sessionId, callerWebContentsId) {
      const entry = sessions.get(sessionId);
      if (!entry) return { ok: false };
      if (callerWebContentsId !== undefined && entry.ownerWebContentsId !== callerWebContentsId) {
        return { ok: false };
      }
      return { ok: destroySession(sessionId) };
    },

    destroyForOwner(ownerWebContentsId) {
      for (const [id, entry] of Array.from(sessions.entries())) {
        if (entry.ownerWebContentsId === ownerWebContentsId) {
          destroySession(id, { reason: "owner-closed" });
        }
      }
    },

    destroyForPlugin(pluginId) {
      for (const [id, entry] of Array.from(sessions.entries())) {
        if (entry.pluginId === pluginId) destroySession(id, { reason: "plugin-changed" });
      }
    },

    destroyForDocument(ownerWebContentsId, documentPath) {
      for (const [id, entry] of Array.from(sessions.entries())) {
        if (entry.ownerWebContentsId === ownerWebContentsId && entry.documentPath === documentPath) {
          destroySession(id, { reason: "document-changed" });
        }
      }
    },

    destroyAll() {
      for (const id of Array.from(sessions.keys())) destroySession(id);
    },

    get(sessionId) {
      return sessions.get(sessionId) ?? null;
    },

    values() {
      return Array.from(sessions.values());
    },
  };
}

function normalizeBounds(bounds, window) {
  const contentBounds = window?.getContentBounds?.() ?? { width: 10_000, height: 10_000 };
  const maxWidth = Math.max(1, Math.floor(Number(contentBounds.width) || 1));
  const maxHeight = Math.max(1, Math.floor(Number(contentBounds.height) || 1));
  const x = Math.min(maxWidth - 1, Math.max(0, Math.floor(Number(bounds?.x) || 0)));
  const y = Math.min(maxHeight - 1, Math.max(0, Math.floor(Number(bounds?.y) || 0)));
  return {
    x,
    y,
    width: Math.min(maxWidth - x, Math.max(1, Math.floor(Number(bounds?.width) || 320))),
    height: Math.min(maxHeight - y, Math.max(1, Math.floor(Number(bounds?.height) || 240))),
  };
}

function installViewNavigationSecurity(webContents, { pluginId, contentHash }) {
  const isAllowed = (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      return url.protocol === "puppyone-plugin:" &&
        url.hostname === pluginId &&
        url.pathname.startsWith(`/${contentHash}/`);
    } catch {
      return false;
    }
  };
  const denyUnexpectedNavigation = (event, targetUrl) => {
    const url = typeof targetUrl === "string" ? targetUrl : event?.url;
    if (!isAllowed(url)) event.preventDefault();
  };
  webContents?.on?.("will-navigate", denyUnexpectedNavigation);
  webContents?.on?.("will-redirect", denyUnexpectedNavigation);
  webContents?.on?.("will-frame-navigate", (event) => {
    if (!event.isMainFrame || !isAllowed(event.url)) event.preventDefault();
  });
  webContents?.on?.("will-attach-webview", (event) => event.preventDefault());
  webContents?.setWindowOpenHandler?.(() => ({ action: "deny" }));
}
