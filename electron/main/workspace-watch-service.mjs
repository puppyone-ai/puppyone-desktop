import fs from "node:fs";
import path from "node:path";
import {
  WORKSPACE_EDIT_REVIEW_FLUSH_DELAY_MS,
  disposeWorkspaceEditReview,
  flushWorkspaceEditReviewChanges,
  initializeWorkspaceEditReview,
  noteWorkspaceEditReviewPath,
} from "../../local-api/edit-review.mjs";

export function createWorkspaceWatchService({ logger = console } = {}) {
  const watchers = new Map();

  function start(sender, rootPath) {
    const resolvedRoot = path.resolve(rootPath);
    let entry = watchers.get(resolvedRoot);

    if (!entry) {
      entry = createWatcher(resolvedRoot, logger);
      watchers.set(resolvedRoot, entry);
    }

    entry.clients.set(sender.id, sender);
    sender.once("destroyed", () => {
      stop(sender.id, resolvedRoot);
    });
  }

  function stop(webContentsId, rootPath) {
    const resolvedRoot = path.resolve(rootPath);
    const entry = watchers.get(resolvedRoot);
    if (!entry) return;

    entry.clients.delete(webContentsId);
    if (entry.clients.size === 0) {
      clearTimeout(entry.debounceTimer);
      clearTimeout(entry.editReviewTimer);
      entry.watcher.close();
      disposeWorkspaceEditReview(resolvedRoot);
      watchers.delete(resolvedRoot);
    }
  }

  function stopForWindow(webContentsId) {
    for (const rootPath of Array.from(watchers.keys())) {
      stop(webContentsId, rootPath);
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
