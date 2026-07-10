import fs from "node:fs";
import path from "node:path";
import {
  WORKSPACE_EDIT_REVIEW_FLUSH_DELAY_MS,
  disposeWorkspaceEditReview,
  flushWorkspaceEditReviewChanges,
  initializeWorkspaceEditReview,
  noteWorkspaceEditReviewPath,
} from "../../local-api/edit-review.mjs";

export const WORKSPACE_WATCH_REARM_MIN_DELAY_MS = 250;
export const WORKSPACE_WATCH_REARM_MAX_DELAY_MS = 30_000;

let workspaceWatchSubscriptionSequence = 0;

export function createWorkspaceWatchService({ logger = console, fsModule = fs } = {}) {
  const watchers = new Map();
  // Token-based subscriptions: cleanup keys on a unique subscriptionId, not on
  // the sender id or root, so a React Strict Mode setup/cleanup cycle cannot let
  // an old stop remove a newer subscription for the same webContents.
  const subscriptions = new Map();

  function start(sender, rootPath) {
    const resolvedRoot = path.resolve(rootPath);
    let entry = watchers.get(resolvedRoot);

    if (!entry) {
      entry = createWatcher(resolvedRoot, logger, fsModule);
      watchers.set(resolvedRoot, entry);
    }

    const subscriptionId = `workspace-watch-${(workspaceWatchSubscriptionSequence += 1)}-${Date.now().toString(36)}`;
    entry.clients.set(subscriptionId, sender);
    subscriptions.set(subscriptionId, { root: resolvedRoot, senderId: sender.id });
    if (typeof sender.once === "function") {
      sender.once("destroyed", () => {
        stop(subscriptionId);
      });
    }

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
      disposeWatcher(entry, subscription.root);
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
    for (const [rootPath, entry] of Array.from(watchers.entries())) {
      disposeWatcher(entry, rootPath);
    }
    watchers.clear();
    subscriptions.clear();
  }

  return {
    start,
    stop,
    stopForWindow,
    closeAll,
    getWatcherCount: () => watchers.size,
  };
}

function createWatcher(rootPath, logger, fsModule) {
  const clients = new Map();
  const entry = {
    clients,
    debounceTimer: null,
    editReviewTimer: null,
    lastEvent: null,
    watcher: null,
    rearmTimer: null,
    rearmDelay: WORKSPACE_WATCH_REARM_MIN_DELAY_MS,
    disposed: false,
    rootPath,
    logger,
    fsModule,
  };

  void initializeWorkspaceEditReview(rootPath).catch((error) => {
    logger.warn("Unable to initialize edit review baseline:", error);
  });

  armWorkspaceWatcher(entry);
  return entry;
}

function armWorkspaceWatcher(entry) {
  if (entry.disposed) return;
  clearTimeout(entry.rearmTimer);
  entry.rearmTimer = null;

  if (entry.watcher) {
    try {
      entry.watcher.close();
    } catch {
      // Best-effort close before re-arm.
    }
    entry.watcher = null;
  }

  try {
    entry.watcher = entry.fsModule.watch(entry.rootPath, { recursive: true }, (eventType, filename) => {
      if (entry.disposed) return;
      if (shouldIgnoreWorkspaceChange(filename)) return;

      entry.lastEvent = {
        rootPath: entry.rootPath,
        eventType: eventType ?? "change",
        path: typeof filename === "string" ? filename : null,
      };
      noteWorkspaceEditReviewPath(entry.rootPath, typeof filename === "string" ? filename : null);
      scheduleWorkspaceEditReviewFlush(entry);
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(() => {
        broadcastWorkspaceChange(entry);
      }, 200);
      if (typeof entry.debounceTimer.unref === "function") entry.debounceTimer.unref();

      // Rename of the watched root (or empty filename) often means the watch
      // handle is dead; re-arm so subsequent edits keep flowing.
      if (eventType === "rename" && (!filename || filename === "" || filename === ".")) {
        scheduleWorkspaceRearm(entry, "watcher-recovered");
      }
    });

    entry.watcher.on("error", (error) => {
      if (entry.disposed) return;
      entry.lastEvent = {
        rootPath: entry.rootPath,
        eventType: "error",
        path: null,
        error: error instanceof Error ? error.message : String(error),
      };
      broadcastWorkspaceChange(entry);
      scheduleWorkspaceRearm(entry, "watcher-error");
    });

    entry.rearmDelay = WORKSPACE_WATCH_REARM_MIN_DELAY_MS;
  } catch (error) {
    entry.lastEvent = {
      rootPath: entry.rootPath,
      eventType: "error",
      path: null,
      error: error instanceof Error ? error.message : String(error),
    };
    broadcastWorkspaceChange(entry);
    scheduleWorkspaceRearm(entry, "watcher-error");
  }
}

function scheduleWorkspaceRearm(entry, reason) {
  if (entry.disposed || entry.rearmTimer) return;
  const delay = entry.rearmDelay;
  entry.rearmDelay = Math.min(entry.rearmDelay * 2, WORKSPACE_WATCH_REARM_MAX_DELAY_MS);
  entry.logger.warn?.("workspace content watcher re-arm scheduled", {
    rootPath: entry.rootPath,
    reason,
    delayMs: delay,
  });
  entry.rearmTimer = setTimeout(() => {
    entry.rearmTimer = null;
    if (entry.disposed) return;
    armWorkspaceWatcher(entry);
    entry.lastEvent = {
      rootPath: entry.rootPath,
      eventType: "change",
      path: null,
      recovered: true,
      reason,
    };
    broadcastWorkspaceChange(entry);
  }, delay);
  if (typeof entry.rearmTimer.unref === "function") entry.rearmTimer.unref();
}

function disposeWatcher(entry, rootPath) {
  entry.disposed = true;
  clearTimeout(entry.debounceTimer);
  clearTimeout(entry.editReviewTimer);
  clearTimeout(entry.rearmTimer);
  entry.debounceTimer = null;
  entry.editReviewTimer = null;
  entry.rearmTimer = null;
  if (entry.watcher) {
    try {
      entry.watcher.close();
    } catch {
      // Best-effort.
    }
    entry.watcher = null;
  }
  disposeWorkspaceEditReview(rootPath);
  entry.clients.clear();
}

function scheduleWorkspaceEditReviewFlush(entry) {
  clearTimeout(entry.editReviewTimer);
  entry.editReviewTimer = setTimeout(() => {
    entry.editReviewTimer = null;
    void flushWorkspaceEditReviewChanges(entry.rootPath)
      .then((request) => {
        if (request) broadcastWorkspaceEditReviewChange(entry, entry.rootPath, request);
      })
      .catch((error) => {
        entry.logger.warn("Unable to flush edit review changes:", error);
      });
  }, WORKSPACE_EDIT_REVIEW_FLUSH_DELAY_MS);
  if (typeof entry.editReviewTimer.unref === "function") entry.editReviewTimer.unref();
}

function broadcastWorkspaceChange(entry) {
  if (!entry.lastEvent) return;

  for (const [id, sender] of entry.clients.entries()) {
    if (typeof sender.isDestroyed === "function" && sender.isDestroyed()) {
      entry.clients.delete(id);
      continue;
    }
    try {
      sender.send("workspace:changed", entry.lastEvent);
    } catch {
      entry.clients.delete(id);
    }
  }
}

function broadcastWorkspaceEditReviewChange(entry, rootPath, request) {
  for (const [id, sender] of entry.clients.entries()) {
    if (typeof sender.isDestroyed === "function" && sender.isDestroyed()) {
      entry.clients.delete(id);
      continue;
    }
    try {
      sender.send("ai-edit-review:updated", {
        rootPath,
        request,
      });
    } catch {
      entry.clients.delete(id);
    }
  }
}

function shouldIgnoreWorkspaceChange(filename) {
  if (!filename) return false;
  const normalized = String(filename).replaceAll("\\", "/");
  return normalized === ".git" || normalized.startsWith(".git/");
}
