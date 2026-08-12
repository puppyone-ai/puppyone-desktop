import { INTERFACE_STYLE_FIRST_PAINT_BACKGROUNDS } from "../interface-style-first-paint.generated.mjs";

export const APPEARANCE_WINDOW_BACKGROUND_CHANNEL = "appearance:set-window-background";

const allowedBackgrounds = new Set(INTERFACE_STYLE_FIRST_PAINT_BACKGROUNDS);

/**
 * Keeps Electron's native window underlay on the same manifest-owned color as
 * the renderer's synchronous first paint. The allowlist prevents the renderer
 * from turning this narrow appearance channel into an arbitrary native setter.
 */
export function registerAppearanceIpcHandlers({ ipcMain, BrowserWindow }) {
  if (!ipcMain || typeof ipcMain.on !== "function") {
    throw new TypeError("Trusted ipcMain is required for appearance synchronization.");
  }
  if (!BrowserWindow || typeof BrowserWindow.fromWebContents !== "function") {
    throw new TypeError("BrowserWindow is required for appearance synchronization.");
  }

  ipcMain.on(APPEARANCE_WINDOW_BACKGROUND_CHANNEL, (event, request) => {
    const background = request?.background;
    if (typeof background !== "string" || !allowedBackgrounds.has(background)) return;

    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (!ownerWindow || ownerWindow.isDestroyed?.()) return;
    ownerWindow.setBackgroundColor(background);
  });
}
