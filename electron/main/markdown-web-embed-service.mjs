import { WebContentsView, session as electronSession } from "electron";
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
  let sequence = 0;

  const destroyEmbed = (id) => {
    const embed = embeds.get(id);
    if (!embed) return false;
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
      assertMarkdownWebEmbedHref(href);

      const id = `md-web-embed-${++sequence}`;
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
        if (!/^https:\/\//i.test(url)) event.preventDefault();
      });
      view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        if (!/^https:\/\//i.test(details.url) && !details.url.startsWith("data:")) {
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
      await view.webContents.loadURL(href);

      embeds.set(id, { id, href, view, window, partitionSession });
      return { id, href };
    },

    setBounds({ id, bounds }) {
      const embed = embeds.get(id);
      if (!embed) return { ok: false };
      embed.view.setBounds(normalizeBounds(bounds));
      return { ok: true };
    },

    destroy({ id }) {
      return { ok: destroyEmbed(id) };
    },

    destroyAll() {
      for (const id of Array.from(embeds.keys())) destroyEmbed(id);
    },
  };
}

function normalizeBounds(bounds) {
  return {
    x: Math.max(0, Math.floor(Number(bounds?.x) || 0)),
    y: Math.max(0, Math.floor(Number(bounds?.y) || 0)),
    width: Math.max(1, Math.floor(Number(bounds?.width) || 320)),
    height: Math.max(1, Math.floor(Number(bounds?.height) || 180)),
  };
}
