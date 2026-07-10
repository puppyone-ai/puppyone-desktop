export function createAgentQuitCoordinator({
  app,
  agentService,
  disposeApplicationServices,
  logger = console,
}) {
  let applicationServicesDisposed = false;
  let drainPromise = null;

  return function handleBeforeQuit(event) {
    if (!applicationServicesDisposed) {
      applicationServicesDisposed = true;
      disposeApplicationServices();
    }

    const retainedSessionCount = typeof agentService.getRetainedSessionCount === "function"
      ? agentService.getRetainedSessionCount()
      : agentService.getSessionCount();
    if (retainedSessionCount === 0) {
      void agentService.closeAll();
      return;
    }

    // Electron does not await asynchronous before-quit listeners. Drain Agent
    // journals and child processes before allowing the second quit attempt.
    event.preventDefault();
    if (drainPromise) return;
    drainPromise = agentService.closeAll()
      .catch((error) => {
        logger.error?.("puppyone failed to drain Agent sessions during quit:", error);
      })
      .finally(() => {
        drainPromise = null;
        app.quit();
      });
  };
}
