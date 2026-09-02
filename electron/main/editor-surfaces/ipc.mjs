export const EDITOR_SURFACE_CHANNELS = Object.freeze({
  activate: "editor-surface:activate",
  setBounds: "editor-surface:set-bounds",
  updateAppearance: "editor-surface:update-appearance",
  destroy: "editor-surface:destroy",
  state: "editor-surface:state",
  bootstrap: "editor-surface:bootstrap",
  ready: "editor-surface:ready",
  error: "editor-surface:error",
  localizationBootstrap: "editor-surface:localization-bootstrap",
});

export function registerEditorSurfaceIpcHandlers({
  trustedIpcMain,
  rawIpcMain,
  manager,
  localeService,
}) {
  trustedIpcMain.handle(EDITOR_SURFACE_CHANNELS.activate, (event, request) => (
    manager.activate({ ...request, ownerWebContentsId: event.sender.id })
  ));
  trustedIpcMain.handle(EDITOR_SURFACE_CHANNELS.setBounds, (event, request) => (
    manager.setBounds(
      request?.sessionId,
      request?.bounds,
      event.sender.id,
      request?.geometryRevision,
      request?.visible,
    )
  ));
  trustedIpcMain.handle(EDITOR_SURFACE_CHANNELS.updateAppearance, (event, request) => (
    manager.updateAppearance(request?.sessionId, request?.appearance, event.sender.id)
  ));
  trustedIpcMain.handle(EDITOR_SURFACE_CHANNELS.destroy, (event, request) => (
    manager.destroy(request?.sessionId, event.sender.id)
  ));

  rawIpcMain.on(EDITOR_SURFACE_CHANNELS.ready, (event, request) => {
    manager.reportReady(request?.sessionId, event.sender.id);
  });
  rawIpcMain.on(EDITOR_SURFACE_CHANNELS.error, (event, request) => {
    manager.reportError(request?.sessionId, event.sender.id, request);
  });
  rawIpcMain.handle(EDITOR_SURFACE_CHANNELS.bootstrap, (event) => (
    manager.getBootstrapForChild(event.sender.id)
  ));
  rawIpcMain.handle(EDITOR_SURFACE_CHANNELS.localizationBootstrap, async (event) => {
    if (!manager.hasChild(event.sender.id)) throw new Error("Untrusted Editor Surface localization request.");
    await localeService.initialize();
    return localeService.getSnapshot();
  });
}
