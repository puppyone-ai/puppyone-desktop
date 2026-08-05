/**
 * Coordinates process runtimes with native browser surfaces.
 *
 * The runtime is workspace-owned; the surface is reusable; renderer
 * attachments are short-lived leases. Keeping this orchestration outside React
 * prevents file switches and StrictMode cleanup from killing local servers.
 */
export function createAppPreviewService({ runtime, browserSurfaces }) {
  if (!runtime || !browserSurfaces) {
    throw new TypeError("App preview runtime and browser surface manager are required.");
  }

  async function activate(sender, request) {
    const runtimeResult = await runtime.start(sender, request);
    if (runtimeResult.status !== "running" || !runtimeResult.url) {
      return { runtime: runtimeResult, surface: null };
    }
    const surface = await browserSurfaces.activate({
      ownerWebContentsId: sender.id,
      rootPath: request.rootPath,
      appId: runtimeResult.appId,
      appPath: runtimeResult.path,
      runtimeId: runtimeResult.runtimeId,
      url: runtimeResult.url,
      bounds: request.bounds,
      attachmentId: request.attachmentId,
    });
    return { runtime: runtimeResult, surface };
  }

  async function restart(sender, request) {
    const runtimeResult = await runtime.restart(sender, request);
    if (!request?.bounds || !request?.attachmentId || !runtimeResult.url) return runtimeResult;
    const surface = await browserSurfaces.activate({
      ownerWebContentsId: sender.id,
      rootPath: request.rootPath,
      appId: runtimeResult.appId,
      appPath: runtimeResult.path,
      runtimeId: runtimeResult.runtimeId,
      url: runtimeResult.url,
      bounds: request.bounds,
      attachmentId: request.attachmentId,
    });
    return { runtime: runtimeResult, surface };
  }

  async function stop(sender, request) {
    const result = await runtime.stop(sender, request);
    if (result.runtimeId) {
      browserSurfaces.destroyWorkspace(request.rootPath, sender.id, "runtime-stopped");
    }
    return result;
  }

  function setSurfaceBounds(sender, request) {
    return browserSurfaces.setBounds({ ...request, callerWebContentsId: sender.id });
  }

  function detachSurface(sender, request) {
    return browserSurfaces.detach({ ...request, callerWebContentsId: sender.id });
  }

  function runSurfaceCommand(sender, request) {
    return browserSurfaces.runCommand({ ...request, callerWebContentsId: sender.id });
  }

  function closeSessionsForWindow(webContentsId) {
    browserSurfaces.destroyOwner(webContentsId, "owner-closed");
    runtime.closeSessionsForWindow(webContentsId);
  }

  function closeAll() {
    browserSurfaces.destroyAll("shutdown");
    return runtime.closeAll();
  }

  return {
    activate,
    start: runtime.start,
    restart,
    stop,
    getLogs: runtime.getLogs,
    openExternal: runtime.openExternal,
    setSurfaceBounds,
    detachSurface,
    runSurfaceCommand,
    closeSessionsForWindow,
    closeAll,
  };
}
