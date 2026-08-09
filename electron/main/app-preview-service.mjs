/**
 * Coordinates process runtimes with native browser surfaces.
 *
 * The runtime is app-owned; the surface is reusable; renderer
 * attachments are short-lived leases. Keeping this orchestration outside React
 * prevents file switches and StrictMode cleanup from killing local servers.
 */
export function createAppPreviewService({
  runtime,
  browserSurfaces,
  idleTimeoutMs = 60_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  if (!runtime || !browserSurfaces) {
    throw new TypeError("App preview runtime and browser surface manager are required.");
  }
  if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs < 0) {
    throw new TypeError("App preview idle timeout must be a non-negative number.");
  }

  const leasesByAttachment = new Map();
  const idleTimersByApp = new Map();
  const lifecycleByApp = new Map();

  function activate(sender, request) {
    cancelIdleForRequest(request);
    return serializeLifecycle(request, async () => {
      let runtimeResult;
      try {
        runtimeResult = await runtime.start(sender, request);
        if (runtimeResult.status !== "running" || !runtimeResult.url) {
          scheduleIdle(request);
          return { runtime: runtimeResult, surface: null };
        }
        const surface = await activateSurface(sender, request, runtimeResult);
        if (surface?.attached === false) scheduleIdle(request);
        else retainLease(sender, request, runtimeResult.path);
        return { runtime: runtimeResult, surface };
      } catch (error) {
        scheduleIdle(request);
        throw error;
      }
    });
  }

  function restart(sender, request) {
    cancelIdleForRequest(request);
    return serializeLifecycle(request, async () => {
      try {
        const runtimeResult = await runtime.restart(sender, request);
        if (!request?.bounds || !request?.attachmentId || !runtimeResult.url) {
          scheduleIdle(request);
          return runtimeResult;
        }
        const surface = await activateSurface(sender, request, runtimeResult);
        if (surface?.attached === false) scheduleIdle(request);
        else retainLease(sender, request, runtimeResult.path);
        return { runtime: runtimeResult, surface };
      } catch (error) {
        scheduleIdle(request);
        throw error;
      }
    });
  }

  function activateSurface(sender, request, runtimeResult) {
    return browserSurfaces.activate({
      ownerWebContentsId: sender.id,
      rootPath: request.rootPath,
      appId: runtimeResult.appId,
      appPath: runtimeResult.path,
      runtimeId: runtimeResult.runtimeId,
      generation: runtimeResult.generation,
      url: runtimeResult.url,
      bounds: request.bounds,
      attachmentId: request.attachmentId,
    });
  }

  function stop(sender, request) {
    const appKey = getAppKey(request.rootPath, request.path);
    cancelIdle(appKey);
    return serializeLifecycle(request, async () => {
      releaseAppLeases(appKey);
      const result = await runtime.stop(sender, request);
      if (result.runtimeId) {
        browserSurfaces.destroyApp(request.rootPath, request.path, null, "runtime-stopped");
      }
      return result;
    });
  }

  function setSurfaceBounds(sender, request) {
    return browserSurfaces.setBounds({ ...request, callerWebContentsId: sender.id });
  }

  function detachSurface(sender, request) {
    const result = browserSurfaces.detach({ ...request, callerWebContentsId: sender.id });
    const lease = releaseLease(sender.id, request?.attachmentId);
    if (lease) scheduleIdle(lease);
    return result;
  }

  function runSurfaceCommand(sender, request) {
    return browserSurfaces.runCommand({ ...request, callerWebContentsId: sender.id });
  }

  function closeSessionsForWindow(webContentsId) {
    releaseOwnerLeases(webContentsId);
    browserSurfaces.destroyOwner(webContentsId, "owner-closed");
    runtime.closeSessionsForWindow(webContentsId);
  }

  function closeAll() {
    for (const appKey of Array.from(idleTimersByApp.keys())) cancelIdle(appKey);
    leasesByAttachment.clear();
    browserSurfaces.destroyAll("shutdown");
    return runtime.closeAll();
  }

  function start(sender, request) {
    cancelIdleForRequest(request);
    return serializeLifecycle(request, () => runtime.start(sender, request));
  }

  function openExternal(sender, request) {
    cancelIdleForRequest(request);
    return serializeLifecycle(request, async () => {
      const result = await runtime.openExternal(sender, request);
      retainLease(sender, {
        ...request,
        attachmentId: `external:${getAppKey(request.rootPath, request.path)}`,
      }, request.path);
      return result;
    });
  }

  function retainLease(sender, request, appPath) {
    const attachmentKey = getAttachmentKey(sender.id, request.attachmentId);
    const previous = leasesByAttachment.get(attachmentKey);
    const lease = {
      appKey: getAppKey(request.rootPath, appPath),
      rootPath: request.rootPath,
      path: appPath,
      ownerWebContentsId: sender.id,
      attachmentId: request.attachmentId,
    };
    leasesByAttachment.set(attachmentKey, lease);
    cancelIdle(lease.appKey);
    if (previous && previous.appKey !== lease.appKey) scheduleIdle(previous);
  }

  function releaseLease(ownerWebContentsId, attachmentId) {
    const attachmentKey = getAttachmentKey(ownerWebContentsId, attachmentId);
    const lease = leasesByAttachment.get(attachmentKey) ?? null;
    if (lease) leasesByAttachment.delete(attachmentKey);
    return lease;
  }

  function releaseOwnerLeases(ownerWebContentsId) {
    const affected = new Map();
    for (const [attachmentKey, lease] of leasesByAttachment) {
      if (lease.ownerWebContentsId !== ownerWebContentsId) continue;
      leasesByAttachment.delete(attachmentKey);
      affected.set(lease.appKey, lease);
    }
    for (const lease of affected.values()) {
      if (hasLease(lease.appKey)) continue;
      cancelIdle(lease.appKey);
    }
  }

  function releaseAppLeases(appKey) {
    for (const [attachmentKey, lease] of leasesByAttachment) {
      if (lease.appKey === appKey) leasesByAttachment.delete(attachmentKey);
    }
  }

  function scheduleIdle(request) {
    const rootPath = request?.rootPath;
    const appPath = request?.path ?? request?.appPath;
    if (typeof rootPath !== "string" || typeof appPath !== "string") return;
    const appKey = getAppKey(rootPath, appPath);
    if (hasLease(appKey) || idleTimersByApp.has(appKey)) return;
    const collector = { timer: null, cancelled: false };
    collector.timer = setTimeoutFn(() => {
      void serializeLifecycle({ rootPath, path: appPath }, async () => {
        if (
          collector.cancelled ||
          idleTimersByApp.get(appKey) !== collector ||
          hasLease(appKey)
        ) {
          return;
        }
        try {
          await runtime.stopForIdle({ rootPath, path: appPath });
        } catch {
          // Runtime shutdown is best effort during idle collection. The native
          // surface must still be released even if the child already exited.
        } finally {
          if (idleTimersByApp.get(appKey) === collector) idleTimersByApp.delete(appKey);
          if (!collector.cancelled && !hasLease(appKey)) {
            browserSurfaces.destroyApp(rootPath, appPath, null, "idle-timeout");
          }
        }
      }).catch(() => undefined);
    }, idleTimeoutMs);
    idleTimersByApp.set(appKey, collector);
  }

  function hasLease(appKey) {
    for (const lease of leasesByAttachment.values()) {
      if (lease.appKey === appKey) return true;
    }
    return false;
  }

  function cancelIdleForRequest(request) {
    if (typeof request?.rootPath !== "string" || typeof request?.path !== "string") return;
    cancelIdle(getAppKey(request.rootPath, request.path));
  }

  function cancelIdle(appKey) {
    const collector = idleTimersByApp.get(appKey);
    if (collector == null) return;
    idleTimersByApp.delete(appKey);
    collector.cancelled = true;
    clearTimeoutFn(collector.timer);
  }

  function serializeLifecycle(request, operation) {
    const appKey = getAppKey(request.rootPath, request.path);
    const previous = lifecycleByApp.get(appKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    lifecycleByApp.set(appKey, current);
    return current.finally(() => {
      if (lifecycleByApp.get(appKey) === current) lifecycleByApp.delete(appKey);
    });
  }

  return {
    activate,
    start,
    restart,
    stop,
    getLogs: runtime.getLogs,
    openExternal,
    setSurfaceBounds,
    detachSurface,
    runSurfaceCommand,
    closeSessionsForWindow,
    closeAll,
  };
}

function getAppKey(rootPath, appPath) {
  return `${rootPath}\n${appPath}`;
}

function getAttachmentKey(ownerWebContentsId, attachmentId) {
  return `${ownerWebContentsId}\n${attachmentId}`;
}
