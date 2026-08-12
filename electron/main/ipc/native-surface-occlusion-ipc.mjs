export const NATIVE_SURFACE_OCCLUSION_CHANNEL = "native-surfaces:set-overlay-occluded";

/**
 * Registers the renderer's owner-scoped product-chrome visibility signal.
 * The trusted IPC wrapper authenticates the top-level application frame; the
 * owner id always comes from Electron's sender rather than renderer input.
 */
export function registerNativeSurfaceOcclusionIpcHandlers({ ipcMain, coordinator }) {
  if (!ipcMain || typeof ipcMain.on !== "function") {
    throw new TypeError("Trusted ipcMain is required for native surface occlusion.");
  }
  if (!coordinator || typeof coordinator.setOwnerOccluded !== "function") {
    throw new TypeError("Native surface occlusion coordinator is required.");
  }

  ipcMain.on(NATIVE_SURFACE_OCCLUSION_CHANNEL, (event, request) => {
    if (typeof request?.occluded !== "boolean") return;
    const ownerWebContentsId = event?.sender?.id;
    if (!Number.isSafeInteger(ownerWebContentsId) || ownerWebContentsId <= 0) return;
    coordinator.setOwnerOccluded(ownerWebContentsId, request.occluded);
  });
}
