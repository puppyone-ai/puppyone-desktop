import fs from "node:fs";
import path from "node:path";
import {
  WORKSPACE_EDIT_REVIEW_FLUSH_DELAY_MS,
  disposeWorkspaceEditReview,
  flushWorkspaceEditReviewChanges,
  initializeWorkspaceEditReview,
  noteWorkspaceEditReviewPath,
} from "../../local-api/edit-review.mjs";

let workspaceWatchSubscriptionSequence = 0;

export function createWorkspaceWatchService({ logger = console } = {}) {
  const watchers = new Map();
  // Token-based subscriptions: cleanup keys on a unique subscriptionId, not on
  // the sender id or root, so a React Strict Mode setup/cleanup cycle cannot let
  // an old stop remove a newer subscription for the same webContents.
  const subscriptions = new Map();

  function start(sender, rootPath) {
    const resolvedRoot = path.resolve(rootPath);
    let entry = watchers.get(resolvedRoot);

    if (!entry) {
      entry = createWatcher(resolvedRoot, logger);
      watchers.set(resolvedRoot, entry);
    }

    const subscriptionId = `workspace-watch-${(workspaceWatchSubscriptionSequence += 1)}-${Date.now().toString(36)}`;
    entry.clients.set(subscriptionId, sender);
    subscriptions.set(subscriptionId, { root: resolvedRoot, senderId: sender.id });
    sender.once("destroyed", () => {
      stop(subscriptionId);
    });

    return { subscriptionId, rootPath: resolvedRoot };
  }

  function stop(subscriptionId, expectedSenderId = null) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription) return { ok: true };
    if (expectedSenderId !== null && subscription.senderId !== expectedSenderId) {
      return { ok: true };
    }
    subscriptions.delete(subscriptionId);

    const entry = watchers.get(subscription.root);
    if (!entry) return { ok: true };

    entry.clients.delete(subscriptionId);
    if (entry.clients.size === 0) {
      clearTimeout(entry.debounceTimer);
      clearTimeout(entry.editReviewTimer);
      entry.watcher.close();
      disposeWorkspaceEditReview(subscription.root);
      watchers.delete(subscription.root);
    }
    return { ok: true };
  }

  function stopForWindow(webContentsId) {
    for (const [subscriptionId, subscription] of Array.from(subscriptions.entries())) {
      if (subscription.senderId === webContentsId) stop(subscriptionId);
    }
  }

  function closeAll() {
    for (const entry of watchers.values()) {
      clearTimeout(entry.debounceTimer);
      clearTimeout(entry.editReviewTimer);
      entry.watcher.close();
    }
    for (const rootPath of watchers.keys()) {
      disposeWorkspaceEditReview(rootPath);
    }
    watchers.clear();
    subscriptions.clear();
  }

  return {
    start,
    stop,
    stopForWindow,
    closeAll,
  };
}

function createWatcher(rootPath, logger) {
  const clients = new Map();
  const entry = {
    clients,
    debounceTimer: null,
    editReviewTimer: null,
    lastEvent: null,
    watcher: null,
  };

  void initializeWorkspaceEditReview(rootPath).catch((error) => {
    logger.warn("Unable to initialize edit review baseline:", error);
  });

  entry.watcher = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
    if (shouldIgnoreWorkspaceChange(filename)) return;

    entry.lastEvent = {
      rootPath,
      eventType: eventType ?? "change",
      path: typeof filename === "string" ? filename : null,
    };
    noteWorkspaceEditReviewPath(rootPath, typeof filename === "string" ? filename : null);
    scheduleWorkspaceEditReviewFlush(entry, rootPath, logger);
    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => {
      broadcastWorkspaceChange(entry);
    }, 200);
  });

  entry.watcher.on("error", (error) => {
    entry.lastEvent = {
      rootPath,
      eventType: "error",
      path: null,
      error: error instanceof Error ? error.message : String(error),
    };
    broadcastWorkspaceChange(entry);
  });

  return entry;
}

function scheduleWorkspaceEditReviewFlush(entry, rootPath, logger) {
  clearTimeout(entry.editReviewTimer);
  entry.editReviewTimer = setTimeout(() => {
    entry.editReviewTimer = null;
    void flushWorkspaceEditReviewChanges(rootPath)
      .then((request) => {
        if (request) broadcastWorkspaceEditReviewChange(entry, rootPath, request);
      })
      .catch((error) => {
        logger.warn("Unable to flush edit review changes:", error);
      });
  }, WORKSPACE_EDIT_REVIEW_FLUSH_DELAY_MS);
}

function broadcastWorkspaceChange(entry) {
  if (!entry.lastEvent) return;

  for (const [id, sender] of entry.clients.entries()) {
    if (sender.isDestroyed()) {
      entry.clients.delete(id);
      continue;
    }
    sender.send("workspace:changed", entry.lastEvent);
  }
}

function broadcastWorkspaceEditReviewChange(entry, rootPath, request) {
  for (const [id, sender] of entry.clients.entries()) {
    if (sender.isDestroyed()) {
      entry.clients.delete(id);
      continue;
    }
    sender.send("ai-edit-review:updated", {
      rootPath,
      request,
    });
  }
}

function shouldIgnoreWorkspaceChange(filename) {
  if (!filename) return false;
  const normalized = String(filename).replaceAll("\\", "/");
  return normalized === ".git" || normalized.startsWith(".git/");
}
