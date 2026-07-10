export function registerMarkdownWebEmbedIpcHandlers({
  ipcMain,
  createMarkdownWebEmbedService,
  getOwnerWindow,
}) {
  const service = createMarkdownWebEmbedService({ getOwnerWindow });

  ipcMain.handle("markdown-web-embed:create", async (event, request) => {
    const ownerWebContentsId = requireLiveMainFrameSender(event);
    return service.create({
      href: request?.href,
      bounds: request?.bounds,
      capability: parseWebEmbedCapabilityScope(request?.capability),
      ownerWebContentsId,
    });
  });

  ipcMain.handle("markdown-web-embed:set-bounds", async (event, request) => {
    const callerWebContentsId = requireLiveMainFrameSender(event);
    return service.setBounds({
      id: request?.id,
      bounds: request?.bounds,
      callerWebContentsId,
    });
  });

  ipcMain.handle("markdown-web-embed:destroy", async (event, request) => {
    const callerWebContentsId = requireLiveMainFrameSender(event);
    return service.destroy({
      id: request?.id,
      callerWebContentsId,
    });
  });

  return service;
}

function parseWebEmbedCapabilityScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.purpose !== "web-embed") {
    throw new Error("Markdown web embed requires a web-embed capability scope.");
  }

  const required = ["editorViewId", "workspaceId", "documentPath", "documentRevision"];
  const capability = { purpose: "web-embed" };
  for (const field of required) {
    const item = value[field];
    if (typeof item !== "string" || item.trim().length === 0 || item.length > 4096) {
      throw new Error(`Markdown web embed capability ${field} is invalid.`);
    }
    capability[field] = item;
  }
  if (value.executionSessionId !== undefined) {
    if (
      typeof value.executionSessionId !== "string" ||
      value.executionSessionId.length === 0 ||
      value.executionSessionId.length > 512
    ) {
      throw new Error("Markdown web embed capability executionSessionId is invalid.");
    }
    capability.executionSessionId = value.executionSessionId;
  }
  return Object.freeze(capability);
}

function requireLiveMainFrameSender(event) {
  const sender = event?.sender;
  const senderFrame = event?.senderFrame;
  if (
    !sender ||
    !Number.isSafeInteger(sender.id) ||
    sender.id <= 0 ||
    sender.isDestroyed?.() ||
    !senderFrame ||
    senderFrame !== sender.mainFrame
  ) {
    throw new Error("Markdown web embed IPC requires a live application main frame.");
  }
  return sender.id;
}
