export function registerTelemetryIpcHandlers({ ipcMain, telemetryService }) {
  if (!telemetryService) throw new TypeError("A desktop telemetry service is required.");

  ipcMain.handle("telemetry:get-state", async () => {
    await telemetryService.initialize();
    return telemetryService.getSnapshot();
  });
  ipcMain.handle("telemetry:get-disclosure", () => telemetryService.getDisclosure());
  ipcMain.handle("telemetry:mark-notice-seen", async () => {
    await telemetryService.markNoticeSeen();
    await telemetryService.noteForegroundActivity();
    return telemetryService.getSnapshot();
  });
  ipcMain.handle("telemetry:set-level", async (_event, request) => {
    const level = request?.level;
    await telemetryService.setLevel(level);
    if (level === "basic") {
      await telemetryService.markNoticeSeen();
      await telemetryService.noteForegroundActivity();
    }
    return telemetryService.getSnapshot();
  });
  ipcMain.handle("telemetry:reset-identity", async () => telemetryService.resetIdentity());
}
