export function registerOfficeEditingIpcHandlers({ ipcMain, officeEditingService, authorizeWorkspaceRoot }) {
  ipcMain.handle("office-editing:get-availability", async () => officeEditingService.getAvailability());

  ipcMain.handle("office-editing:create-session", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    return officeEditingService.createSession({
      ownerId: requireSenderId(event),
      rootPath,
      relativePath: request?.path,
      locale: request?.locale,
    });
  });

  ipcMain.handle("office-editing:force-save", async (event, request) => officeEditingService.forceSave({
    ownerId: requireSenderId(event),
    sessionId: requireSessionId(request?.sessionId),
  }));

  ipcMain.handle("office-editing:surface-attach", async (event, request) => officeEditingService.attachSurface({
    ownerId: requireSenderId(event),
    sessionId: requireSessionId(request?.sessionId),
    attachmentId: request?.attachmentId,
    bounds: request?.bounds,
  }));

  ipcMain.handle("office-editing:surface-set-bounds", async (event, request) => officeEditingService.setSurfaceBounds({
    ownerId: requireSenderId(event),
    surfaceId: request?.surfaceId,
    attachmentId: request?.attachmentId,
    bounds: request?.bounds,
  }));

  ipcMain.handle("office-editing:surface-detach", async (event, request) => officeEditingService.detachSurface({
    ownerId: requireSenderId(event),
    surfaceId: request?.surfaceId,
    attachmentId: request?.attachmentId,
  }));

  ipcMain.handle("office-editing:close-session", async (event, request) => officeEditingService.closeSession({
    ownerId: requireSenderId(event),
    sessionId: requireSessionId(request?.sessionId),
  }));

  ipcMain.handle("office-editing:resolve-conflict", async (event, request) => officeEditingService.resolveConflict({
    ownerId: requireSenderId(event),
    sessionId: requireSessionId(request?.sessionId),
    resolution: request?.resolution,
  }));
}

function requireSenderId(event) {
  const senderId = event?.sender?.id;
  if (!Number.isSafeInteger(senderId) || senderId <= 0) throw new Error("Office session sender is invalid.");
  return senderId;
}

function requireSessionId(value) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Office session id is invalid.");
  return value;
}
