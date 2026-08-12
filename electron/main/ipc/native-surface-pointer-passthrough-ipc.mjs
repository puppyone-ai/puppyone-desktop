export const NATIVE_SURFACE_POINTER_PASSTHROUGH_CHANNEL =
  "native-surfaces:set-pointer-passthrough";

/** Registers the trusted, owner-scoped native pointer routing signal. */
export function registerNativeSurfacePointerPassthroughIpcHandlers({ ipcMain, coordinator }) {
  if (!ipcMain || typeof ipcMain.on !== "function") {
    throw new TypeError("Trusted ipcMain is required for native surface pointer passthrough.");
  }
  if (!coordinator || typeof coordinator.setOwnerActive !== "function") {
    throw new TypeError("Native surface pointer passthrough coordinator is required.");
  }

  ipcMain.on(NATIVE_SURFACE_POINTER_PASSTHROUGH_CHANNEL, (event, request) => {
    if (typeof request?.active !== "boolean") return;
    const ownerWebContentsId = event?.sender?.id;
    if (!Number.isSafeInteger(ownerWebContentsId) || ownerWebContentsId <= 0) return;
    coordinator.setOwnerActive(ownerWebContentsId, request.active);
  });
}
