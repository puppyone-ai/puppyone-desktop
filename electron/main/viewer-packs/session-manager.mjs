import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerPluginProtocol as defaultRegisterPluginProtocol } from "./plugin-protocol.mjs";
import { registerResourceProtocol as defaultRegisterResourceProtocol } from "./resource-protocol.mjs";

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
      ownerWebContentsId,
      bounds,
    }) {
      const window = getOwnerWindow(ownerWebContentsId);
      if (!window || window.isDestroyed()) {
        throw new Error("Owner window unavailable for viewer pack session.");
      }

      // One session per owner window + document.
      for (const [id, existing] of Array.from(sessions.entries())) {
        if (
          existing.ownerWebContentsId === ownerWebContentsId &&
          existing.documentPath === documentPath
        ) {
          destroySession(id, { reason: "replaced" });
        }
      }

      const instanceId = randomUUID();
      const sessionId = `vps_${instanceId}`;
      const partition = `temp:viewer-pack-${sessionId}`;
      const partitionSession = sessionFromPartition(partition, { cache: false });
      applyPluginSessionSecurity(partitionSession, { pluginId, contentHash });

      // Bind the pack + resource protocols to THIS session's partition, scoped
      // to this exact audience, before we ever navigate. A resource URL minted
      // here is only ever readable from this session.
      registerPluginProtocol({
        session: partitionSession,
        registryService,
        getMimeType,
      });
      registerResourceProtocol({
        session: partitionSession,
        broker: resourceBroker,
        audience: { pluginId, instanceId, ownerWebContentsId },
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
          preload: pluginPreloadPath,
        },
      });

      const packageDir = store.packageVersionDir(pluginId, version);
      const entryPath = path.join(packageDir, entry);

      // Production always loads over the registered custom protocol so pack
      // assets stay bound to the session partition. No silent file:// fallback.
      const pluginOriginUrl = `puppyone-plugin://${pluginId}/${contentHash}/${entry}`;

      view.setBounds(normalizeBounds(bounds));
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
        ownerWebContentsId,
        window,
        view,
        partitionSession,
        packageDir,
      };
      sessions.set(sessionId, entryRecord);

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
      entry.view.setBounds(normalizeBounds(bounds));
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

function normalizeBounds(bounds) {
  return {
    x: Math.max(0, Math.floor(Number(bounds?.x) || 0)),
    y: Math.max(0, Math.floor(Number(bounds?.y) || 0)),
    width: Math.max(1, Math.floor(Number(bounds?.width) || 320)),
    height: Math.max(1, Math.floor(Number(bounds?.height) || 240)),
  };
}
