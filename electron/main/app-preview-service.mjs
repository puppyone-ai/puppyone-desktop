/**
 * Serializes privileged App Preview runtime mutations.
 *
 * Rendering belongs to the editor iframe. This coordinator owns no browser
 * surface, geometry or attachment lease; it only prevents start/restart/stop
 * races and makes window/app shutdown wait for pending runtime mutations.
 */
export function createAppPreviewService({ runtime }) {
  if (!runtime) throw new TypeError("App preview runtime is required.");

  const lifecycleByApp = new Map();
  const appRequestsByOwner = new Map();

  function start(sender, request) {
    rememberOwnerRequest(sender, request);
    return serialize(request, () => runtime.start(sender, request));
  }

  function restart(sender, request) {
    rememberOwnerRequest(sender, request);
    return serialize(request, () => runtime.restart(sender, request));
  }

  function stop(sender, request) {
    return serialize(request, () => runtime.stop(sender, request));
  }

  function openExternal(sender, request) {
    rememberOwnerRequest(sender, request);
    return serialize(request, () => runtime.openExternal(sender, request));
  }

  function closeSessionsForWindow(webContentsId) {
    const ownerRequests = appRequestsByOwner.get(webContentsId);
    appRequestsByOwner.delete(webContentsId);
    const pending = ownerRequests
      ? Array.from(ownerRequests.values(), (request) => waitForCurrent(request))
      : [];
    return Promise.allSettled(pending)
      .then(() => runtime.closeSessionsForWindow(webContentsId));
  }

  function closeAll() {
    appRequestsByOwner.clear();
    return Promise.allSettled(Array.from(lifecycleByApp.values()))
      .then(() => runtime.closeAll());
  }

  function rememberOwnerRequest(sender, request) {
    if (!Number.isInteger(sender?.id)) return;
    const normalized = normalizeRequestIdentity(request);
    if (!normalized) return;
    let requests = appRequestsByOwner.get(sender.id);
    if (!requests) {
      requests = new Map();
      appRequestsByOwner.set(sender.id, requests);
    }
    requests.set(getAppKey(normalized.rootPath, normalized.path), normalized);
  }

  function waitForCurrent(request) {
    const identity = normalizeRequestIdentity(request);
    if (!identity) return Promise.resolve();
    return lifecycleByApp.get(getAppKey(identity.rootPath, identity.path)) ?? Promise.resolve();
  }

  function serialize(request, operation) {
    const identity = normalizeRequestIdentity(request);
    if (!identity) return Promise.resolve().then(operation);
    const appKey = getAppKey(identity.rootPath, identity.path);
    const previous = lifecycleByApp.get(appKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    lifecycleByApp.set(appKey, current);
    return current.finally(() => {
      if (lifecycleByApp.get(appKey) === current) lifecycleByApp.delete(appKey);
    });
  }

  return {
    start,
    restart,
    stop,
    getLogs: runtime.getLogs,
    openExternal,
    closeSessionsForWindow,
    closeAll,
  };
}

function normalizeRequestIdentity(request) {
  if (typeof request?.rootPath !== "string" || typeof request?.path !== "string") return null;
  return { rootPath: request.rootPath, path: request.path };
}

function getAppKey(rootPath, appPath) {
  return `${rootPath}\n${appPath}`;
}
