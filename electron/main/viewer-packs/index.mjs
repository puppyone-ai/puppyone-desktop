import path from "node:path";
import { fileURLToPath } from "node:url";
import { createViewerPackStore } from "./store.mjs";
import { createViewerPackPackageService } from "./package-service.mjs";
import { createViewerPackRegistryService } from "./registry-service.mjs";
import { createViewerPackCatalogService, createDisabledCatalogTransport } from "./catalog-service.mjs";
import { createViewerPackResourceBroker } from "./resource-broker.mjs";
import { createViewerPackSessionManager } from "./session-manager.mjs";
import { applyPluginSessionSecurity } from "./plugin-session-security.mjs";
import { resolveViewerPackRoute } from "./router.mjs";
import { getPinnedViewerPackPublicKeys } from "./package-signature.mjs";
import { RESOURCE_PROTOCOL_SCHEME } from "./resource-protocol.mjs";
import { resolveExistingWorkspacePath, statWorkspaceFile, readWorkspaceFileRange } from "../../../local-api/workspace.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// App-frame channels — MUST be registered through trustedIpcMain (rejects any
// non-application frame URL). These carry install/activate/bounds authority.
export const VIEWER_PACK_APP_IPC_CHANNELS = Object.freeze({
  getSnapshot: "viewer-pack:get-snapshot",
  installLocal: "viewer-pack:install-local",
  disable: "viewer-pack:disable",
  uninstall: "viewer-pack:uninstall",
  activate: "viewer-pack:activate",
  setBounds: "viewer-pack:set-bounds",
  destroySession: "viewer-pack:destroy-session",
});

// Plugin-frame channels — MUST use RAW ipcMain with sender → session validation.
// trustedIpcMain would reject these because the sandboxed pack frame's URL is
// never the trusted application URL.
export const VIEWER_PACK_PLUGIN_IPC_CHANNELS = Object.freeze({
  documentGetMeta: "viewer-pack:document-get-meta",
  resourceOpen: "viewer-pack:resource-open",
  resourceReadRange: "viewer-pack:resource-read-range",
  resourceCreateRangeUrl: "viewer-pack:resource-create-range-url",
  resourceClose: "viewer-pack:resource-close",
  uiSetState: "viewer-pack:ui-set-state",
  uiGetTheme: "viewer-pack:ui-get-theme",
  hostOpenExternal: "viewer-pack:host-open-external",
});

/**
 * Build an opaque, session-scoped resource URL. The `puppyone-resource://`
 * protocol is registered per session partition and bound to that session's
 * audience, so this URL is only ever readable from the session it was minted
 * for.
 */
export function createRangeUrl(handleId) {
  return `${RESOURCE_PROTOCOL_SCHEME}://handle/${encodeURIComponent(handleId)}`;
}

/**
 * Compose Viewer Pack host services for the Electron main process.
 */
export function createViewerPackHost({
  WebContentsView,
  sessionFromPartition,
  getOwnerWindow,
  userDataPath,
  allowTestKeys = process.env.PUPPYONE_VIEWER_PACK_ALLOW_TEST_KEYS === "1",
  getMimeType = null,
  allowFileFallback = false,
}) {
  if (typeof userDataPath !== "string" || !userDataPath.trim()) {
    throw new TypeError("userDataPath is required for createViewerPackHost.");
  }
  const store = createViewerPackStore({ userDataPath });
  const registry = createViewerPackRegistryService({ store });
  const packages = createViewerPackPackageService({
    store,
    getPublicKeys: () => getPinnedViewerPackPublicKeys({ allowTestKeys }),
  });
  const catalog = createViewerPackCatalogService({
    transport: createDisabledCatalogTransport(),
  });

  const resourceBroker = createViewerPackResourceBroker({
    resolveAuthorizedFilePath: async ({ rootPath, relativePath }) => {
      const absolutePath = await resolveExistingWorkspacePath(rootPath, relativePath);
      return {
        absolutePath,
        rootPath,
        relativePath,
      };
    },
  });

  const sessions = createViewerPackSessionManager({
    WebContentsView,
    sessionFromPartition,
    getOwnerWindow,
    pluginPreloadPath: path.join(__dirname, "../../plugin-preload.cjs"),
    store,
    registryService: registry,
    resourceBroker,
    applyPluginSessionSecurity,
    getMimeType,
    allowFileFallback,
  });

  /**
   * Map a plugin frame's WebContents back to its owning session id. Non-plugin
   * senders resolve to null so plugin bridge handlers fail closed.
   */
  function getSessionIdForSender(sender) {
    const senderId = typeof sender?.id === "number" ? sender.id : null;
    if (senderId === null) return null;
    for (const session of sessions.values()) {
      let viewWebContentsId = null;
      try {
        viewWebContentsId = session.view?.webContents?.id ?? null;
      } catch {
        viewWebContentsId = null;
      }
      if (viewWebContentsId === senderId) return session.sessionId;
    }
    return null;
  }

  function requireSessionForSender(sender) {
    const sessionId = getSessionIdForSender(sender);
    const session = sessionId ? sessions.get(sessionId) : null;
    if (!session) throw new Error("No active viewer pack session for sender.");
    return session;
  }

  return {
    store,
    registry,
    packages,
    catalog,
    resourceBroker,
    sessions,
    resolveRoute: resolveViewerPackRoute,
    getSessionIdForSender,
    requireSessionForSender,
    async getSnapshot() {
      return registry.getContributionSnapshot();
    },
    async installLocalPackage(request) {
      const result = await packages.installFromBytes(request);
      registry.invalidate();
      return result;
    },
    async disablePack(pluginId) {
      const result = await packages.disable(pluginId);
      registry.invalidate();
      sessions.destroyAll();
      return result;
    },
    async uninstallPack(pluginId) {
      const result = await packages.uninstall(pluginId);
      registry.invalidate();
      sessions.destroyAll();
      return result;
    },
    async activateSession(request) {
      return sessions.activate(request);
    },
    async openResourceForSession(session) {
      const meta = await statWorkspaceFile(session.rootPath, session.relativePath);
      return resourceBroker.openForDocument({
        pluginId: session.pluginId,
        instanceId: session.instanceId,
        ownerWebContentsId: session.ownerWebContentsId,
        documentPath: session.documentPath,
        documentRevision: meta.revision,
        rootPath: session.rootPath,
        relativePath: session.relativePath,
      });
    },
    async readResourceRange(session, request) {
      return resourceBroker.readRange({
        handle: request.handle,
        offset: request.offset,
        length: request.length,
        pluginId: session.pluginId,
        instanceId: session.instanceId,
        ownerWebContentsId: session.ownerWebContentsId,
      });
    },
    createRangeUrlForSession(session, handle) {
      const entry = resourceBroker.getHandle(handle);
      if (!entry) throw new Error("Unknown or revoked resource handle.");
      if (
        entry.pluginId !== session.pluginId ||
        entry.instanceId !== session.instanceId ||
        entry.ownerWebContentsId !== session.ownerWebContentsId
      ) {
        throw new Error("Resource handle audience mismatch.");
      }
      return createRangeUrl(handle);
    },
    readWorkspaceFileRange,
    statWorkspaceFile,
    destroyAllSessions() {
      sessions.destroyAll();
    },
    destroySessionsForOwner(ownerWebContentsId) {
      sessions.destroyForOwner(ownerWebContentsId);
    },
  };
}

/**
 * Register APP-authority handlers (snapshot/install/activate/bounds/destroy)
 * through the trusted IPC facade. Pass `trustedIpcMain` as `ipcMain`.
 */
export function registerViewerPackAppIpcHandlers({ ipcMain, host }) {
  ipcMain.handle(VIEWER_PACK_APP_IPC_CHANNELS.getSnapshot, async () => host.getSnapshot());

  ipcMain.handle(VIEWER_PACK_APP_IPC_CHANNELS.installLocal, async (_event, request) => {
    return host.installLocalPackage({
      archiveBytes: Buffer.from(request.archiveBytes),
      signatureBase64Url: request.signatureBase64Url,
      expectedSha256: request.expectedSha256 ?? null,
      sourceLabel: request.sourceLabel ?? "local-selection",
    });
  });

  ipcMain.handle(VIEWER_PACK_APP_IPC_CHANNELS.disable, async (_event, request) => host.disablePack(request.pluginId));
  ipcMain.handle(VIEWER_PACK_APP_IPC_CHANNELS.uninstall, async (_event, request) => host.uninstallPack(request.pluginId));

  ipcMain.handle(VIEWER_PACK_APP_IPC_CHANNELS.activate, async (event, request) => {
    return host.activateSession({
      ...request,
      ownerWebContentsId: event.sender.id,
    });
  });

  ipcMain.handle(VIEWER_PACK_APP_IPC_CHANNELS.setBounds, async (event, request) => {
    return host.sessions.setBounds(request.sessionId, request.bounds, event.sender.id);
  });

  ipcMain.handle(VIEWER_PACK_APP_IPC_CHANNELS.destroySession, async (event, request) => {
    return host.sessions.destroy(request.sessionId, event.sender.id);
  });
}

/**
 * Register PLUGIN bridge handlers on RAW `ipcMain`. Every handler resolves the
 * sender back to its session first; a sender with no session fails closed.
 * trustedIpcMain must NOT be used here — it rejects the sandboxed pack frame.
 */
export function registerViewerPackPluginIpcHandlers({
  ipcMain,
  host,
  getSessionIdForSender = host.getSessionIdForSender,
}) {
  const requireSession = (sender) => {
    const sessionId = getSessionIdForSender(sender);
    const session = sessionId ? host.sessions.get(sessionId) : null;
    if (!session) throw new Error("No active viewer pack session for sender.");
    return session;
  };

  ipcMain.handle(VIEWER_PACK_PLUGIN_IPC_CHANNELS.documentGetMeta, async (event) => {
    const session = requireSession(event.sender);
    const meta = await host.statWorkspaceFile(session.rootPath, session.relativePath);
    return {
      id: session.documentPath,
      name: session.documentName ?? meta.name,
      mimeType: session.documentMimeType ?? meta.mimeType,
      sizeBytes: meta.size,
      revision: meta.revision,
    };
  });

  ipcMain.handle(VIEWER_PACK_PLUGIN_IPC_CHANNELS.resourceOpen, async (event) => {
    const session = requireSession(event.sender);
    return host.openResourceForSession(session);
  });

  ipcMain.handle(VIEWER_PACK_PLUGIN_IPC_CHANNELS.resourceReadRange, async (event, request) => {
    const session = requireSession(event.sender);
    const result = await host.readResourceRange(session, request);
    return result.bytes;
  });

  ipcMain.handle(VIEWER_PACK_PLUGIN_IPC_CHANNELS.resourceCreateRangeUrl, async (event, request) => {
    const session = requireSession(event.sender);
    return host.createRangeUrlForSession(session, request.handle);
  });

  ipcMain.handle(VIEWER_PACK_PLUGIN_IPC_CHANNELS.resourceClose, async (event, request) => {
    const session = requireSession(event.sender);
    return {
      ok: host.resourceBroker.close(request.handle, {
        pluginId: session.pluginId,
        instanceId: session.instanceId,
        ownerWebContentsId: session.ownerWebContentsId,
      }),
    };
  });

  ipcMain.handle(VIEWER_PACK_PLUGIN_IPC_CHANNELS.uiGetTheme, async (event) => {
    requireSession(event.sender);
    return { mode: "light", tokens: {} };
  });

  ipcMain.handle(VIEWER_PACK_PLUGIN_IPC_CHANNELS.hostOpenExternal, async (event) => {
    const session = requireSession(event.sender);
    return { ok: true, path: session.documentPath };
  });

  if (typeof ipcMain.on === "function") {
    ipcMain.on(VIEWER_PACK_PLUGIN_IPC_CHANNELS.uiSetState, (event) => {
      // Validate the sender; state itself is advisory and not persisted here.
      try {
        requireSession(event.sender);
      } catch {
        // Ignore state from a sender with no session.
      }
    });
  }
}
