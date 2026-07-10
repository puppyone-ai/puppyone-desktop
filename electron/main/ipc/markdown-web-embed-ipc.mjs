export function registerMarkdownWebEmbedIpcHandlers({
  ipcMain,
  createMarkdownWebEmbedService,
  getOwnerWindow,
}) {
  const service = createMarkdownWebEmbedService({ getOwnerWindow });

  ipcMain.handle("markdown-web-embed:create", async (event, request) => {
    return service.create({
      href: request?.href,
      bounds: request?.bounds,
      ownerWebContentsId: event.sender.id,
    });
  });

  ipcMain.handle("markdown-web-embed:set-bounds", async (event, request) => {
    return service.setBounds({
      id: request?.id,
      bounds: request?.bounds,
      callerWebContentsId: event.sender.id,
    });
  });

  ipcMain.handle("markdown-web-embed:destroy", async (event, request) => {
    return service.destroy({
      id: request?.id,
      callerWebContentsId: event.sender.id,
    });
  });

  return service;
}
