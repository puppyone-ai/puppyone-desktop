export const PANE_PREVIEW_CAPTURE_CHANNEL = "pane-preview:capture";
export const PANE_PREVIEW_MAX_WIDTH = 240;
export const PANE_PREVIEW_MAX_HEIGHT = 156;
export const PANE_PREVIEW_MAX_SCALE = 0.36;

/** Captures only the trusted sender's visible pane rectangle and returns a small drag bitmap. */
export function registerPanePreviewIpcHandlers({ ipcMain, BrowserWindow }) {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new TypeError("Trusted ipcMain is required for pane preview capture.");
  }
  if (!BrowserWindow || typeof BrowserWindow.fromWebContents !== "function") {
    throw new TypeError("BrowserWindow is required for pane preview capture.");
  }

  ipcMain.handle(PANE_PREVIEW_CAPTURE_CHANNEL, async (event, request) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (!ownerWindow || ownerWindow.isDestroyed?.()) return null;
    if (typeof event.sender?.capturePage !== "function") return null;

    const contentSize = ownerWindow.getContentSize?.();
    const rect = normalizeCaptureRect(request, contentSize);
    if (!rect) return null;

    try {
      const snapshot = await event.sender.capturePage(rect, {
        stayHidden: true,
        stayAwake: false,
      });
      if (!snapshot || snapshot.isEmpty?.()) return null;

      const scale = Math.min(
        PANE_PREVIEW_MAX_WIDTH / rect.width,
        PANE_PREVIEW_MAX_HEIGHT / rect.height,
        PANE_PREVIEW_MAX_SCALE,
      );
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      const resized = snapshot.resize({ width, height, quality: "good" });
      if (!resized || resized.isEmpty?.()) return null;

      return {
        dataUrl: resized.toDataURL(),
        width,
        height,
      };
    } catch {
      return null;
    }
  });
}

export function normalizeCaptureRect(request, contentSize) {
  if (!request || !Array.isArray(contentSize) || contentSize.length < 2) return null;
  const values = [request.x, request.y, request.width, request.height];
  if (!values.every(Number.isFinite)) return null;

  const contentWidth = Math.max(0, Math.floor(contentSize[0]));
  const contentHeight = Math.max(0, Math.floor(contentSize[1]));
  if (contentWidth < 1 || contentHeight < 1 || request.width <= 0 || request.height <= 0) {
    return null;
  }

  const left = Math.min(contentWidth, Math.max(0, Math.floor(request.x)));
  const top = Math.min(contentHeight, Math.max(0, Math.floor(request.y)));
  const right = Math.min(contentWidth, Math.max(left, Math.ceil(request.x + request.width)));
  const bottom = Math.min(contentHeight, Math.max(top, Math.ceil(request.y + request.height)));
  if (right <= left || bottom <= top) return null;

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
