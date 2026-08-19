export function registerAgentActivityIpcHandlers({ ipcMain, activityHost }) {
  ipcMain.handle("agent-activity:subscribe", (event) => activityHost.subscribe(event.sender));
  ipcMain.on("agent-activity:unsubscribe", (event) => activityHost.unsubscribe(event.sender));
  ipcMain.handle("agent-activity:enrollment-snapshot", () => activityHost.getEnrollmentSnapshot());
  ipcMain.handle("agent-activity:enrollment-set", (_event, request) => {
    if (!request || typeof request.providerId !== "string" || typeof request.enabled !== "boolean") {
      throw new TypeError("Invalid Agent activity enrollment request.");
    }
    return activityHost.setEnrollmentEnabled(request.providerId, request.enabled);
  });
}
