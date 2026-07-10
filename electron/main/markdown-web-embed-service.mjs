import { WebContentsView, session as electronSession } from "electron";
import { randomUUID } from "node:crypto";
import { assertMarkdownWebEmbedHref } from "./markdown-web-embed-policy.mjs";

/**
 * Main-process markdown web-embed service.
 * Creates sandboxed WebContentsView instances in temporary no-credential
 * partitions. Markdown widgets never create these surfaces directly.
 */
export function createMarkdownWebEmbedService({
  getOwnerWindow,
}) {
  const embeds = new Map();

  const generateId = () => `md-web-embed-${randomUUID()}`;

  const destroyEmbed = (id, callerWebContentsId) => {
    const embed = embeds.get(id);
    if (!embed) return false;

    if (callerWebContentsId !== undefined && embed.ownerWebContentsId !== callerWebContentsId) {
      return false;
    }

    embeds.delete(id);
    try {
      if (embed.window && !embed.window.isDestroyed() && typeof embed.window.contentView?.removeChildView === "function") {
        embed.window.contentView.removeChildView(embed.view);
      }
    } catch {
      // ignore detach races
    }
    try {
      embed.view.webContents?.destroy?.();
    } catch {
      // ignore
    }
    try {
      embed.partitionSession?.clearStorageData?.().catch?.(() => undefined);
    } catch {
      // ignore
    }
    return true;
  };

  return {
    async create({ href, bounds, ownerWebContentsId }) {
      const canonicalHref = assertMarkdownWebEmbedHref(href);

      const id = generateId();
      const partition = `temp:md-embed-${id}`;
      const partitionSession = electronSession.fromPartition(partition, { cache: false });

      partitionSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });
      partitionSession.setPermissionCheckHandler(() => false);

      const view = new WebContentsView({
        webPreferences: {
          session: partitionSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false,
          webSecurity: true,
        },
      });

      view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      view.webContents.on("will-navigate", (event, url) => {
        if (!isAllowedMarkdownWebEmbedHref(url)) event.preventDefault();
      });
      // Cancel redirects to any non-policy URL (e.g. https -> http downgrade,
      // redirect to a private/loopback host, or a custom/file scheme).
      view.webContents.on("will-redirect", (event, url) => {
        if (!isAllowedMarkdownWebEmbedHref(url)) event.preventDefault();
      });
      view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        // Deny EVERY non-policy subresource, including data: and blob:. Only
        // public https URLs that pass the embed policy may load.
        if (!isAllowedMarkdownWebEmbedHref(details.url)) {
          callback({ cancel: true });
          return;
        }
        callback({});
      });

      const window = getOwnerWindow(ownerWebContentsId);
      if (!window || window.isDestroyed()) {
        view.webContents.destroy();
        throw new Error("Owner window is unavailable for markdown web embed.");
      }

      const nextBounds = normalizeBounds(bounds);
      view.setBounds(nextBounds);
      window.contentView.addChildView(view);
      await view.webContents.loadURL(canonicalHref);

      embeds.set(id, { id, href: canonicalHref, view, window, partitionSession, ownerWebContentsId });
      return { id, href: canonicalHref };
    },

    setBounds({ id, bounds, callerWebContentsId }) {
      const embed = embeds.get(id);
      if (!embed) return { ok: false };
      if (callerWebContentsId !== undefined && embed.ownerWebContentsId !== callerWebContentsId) {
        return { ok: false };
      }
      embed.view.setBounds(normalizeBounds(bounds));
      return { ok: true };
    },

    destroy({ id, callerWebContentsId }) {
      return { ok: destroyEmbed(id, callerWebContentsId) };
    },

    destroyAll() {
      for (const id of Array.from(embeds.keys())) destroyEmbed(id, undefined);
    },
  };
}

function isAllowedMarkdownWebEmbedHref(href) {
  try {
    assertMarkdownWebEmbedHref(href);
    return true;
  } catch {
    return false;
  }
}

function normalizeBounds(bounds) {
  return {
    x: Math.max(0, Math.floor(Number(bounds?.x) || 0)),
    y: Math.max(0, Math.floor(Number(bounds?.y) || 0)),
    width: Math.max(1, Math.floor(Number(bounds?.width) || 320)),
    height: Math.max(1, Math.floor(Number(bounds?.height) || 180)),
  };
}
