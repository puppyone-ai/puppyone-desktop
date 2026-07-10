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

  ipcMain.handle("markdown-web-embed:set-bounds", async (_event, request) => {
    return service.setBounds({
      id: request?.id,
      bounds: request?.bounds,
    });
  });

  ipcMain.handle("markdown-web-embed:destroy", async (_event, request) => {
    return service.destroy({ id: request?.id });
  });

  return service;
}
