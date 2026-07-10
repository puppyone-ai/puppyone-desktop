// Git metadata watch service.
//
// A separate main-process watcher whose events invalidate ONLY repository
// state. It must not refresh Explorer or enter edit-review. See
// docs/architecture/git/status-refresh-lifecycle.md (Work Package 1).
//
// Design notes:
//   - Repository-owned paths are resolved through Git (never renderer-supplied)
//     via resolveGitRepositoryIdentity. Derived paths inherit authority from
//     the authorized workspace root.
//   - Watchers are reference-counted per worktree identity. A React Strict Mode
//     setup/cleanup cycle cannot let an old stop remove a newer subscription,
//     because cleanup keys on the unique subscriptionId, not the root.
//   - Non-repository workspaces keep a pending subscription that watches the
//     workspace root for `.git` appearance, then promotes into a full metadata
//     watch (covers "initialize Git after the watcher has started").
//   - Linked worktrees may share a common Git directory; common-dir events fan
//     out to every subscribed worktree whose snapshot can be affected.
//   - Events are invalidation hints only. Noise (index.lock, objects/, watcher
//     cookies) is filtered so it does not trigger repeated status reads.
//   - Node fs.watch is fragile: we re-arm on replace/delete/error with bounded
//     exponential backoff (250ms -> 30s).

import fs from "node:fs";
import path from "node:path";
import { resolveGitRepositoryIdentity as defaultResolveIdentity } from "../../local-api/workspace.mjs";

export const GIT_REPOSITORY_INVALIDATED_CHANNEL = "git-repository:invalidated";

export const GIT_METADATA_INVALIDATION_DEBOUNCE_MS = 120;
export const GIT_METADATA_REARM_MIN_DELAY_MS = 250;
export const GIT_METADATA_REARM_MAX_DELAY_MS = 30_000;

let subscriptionSequence = 0;

export function createGitMetadataWatchService({
  logger = console,
  resolveIdentity = defaultResolveIdentity,
  fsModule = fs,
} = {}) {
  // Keyed by canonical worktree identity (topLevel + gitDir + commonDir).
  const repositories = new Map();
  // Shared common-dir watchers: commonDir -> { watcher, repositories: Set<identityKey> }
  const commonDirWatchers = new Map();
  // subscriptionId -> subscription record
  const subscriptions = new Map();
  // Pending non-repo root watches: workspaceRoot -> { watcher, subscriptionIds: Set }
  const pendingRoots = new Map();

  async function start(sender, rootPath) {
    const identity = await resolveIdentity(rootPath);
    const subscriptionId = `git-watch-${(subscriptionSequence += 1)}-${Date.now().toString(36)}`;
    const workspaceRoot = identity.workspaceRoot || path.resolve(rootPath);

    if (typeof sender.once === "function") {
      sender.once("destroyed", () => stop(subscriptionId));
    }

    if (!identity.repository || !identity.gitDir) {
      subscriptions.set(subscriptionId, {
        kind: "pending",
        senderId: sender.id,
        sender,
        workspaceRoot,
        identityKey: null,
      });
      armPendingRootWatch(workspaceRoot);
      pendingRoots.get(workspaceRoot)?.subscriptionIds.add(subscriptionId);

      logger.info?.("git metadata watch pending (not a repository yet)", {
        subscriptionId,
        rootPath: workspaceRoot,
      });

      return { subscriptionId, rootPath: workspaceRoot, repository: false };
    }

    return attachRepositorySubscription({
      subscriptionId,
      sender,
      identity,
    });
  }

  function attachRepositorySubscription({ subscriptionId, sender, identity }) {
    const identityKey = buildIdentityKey(identity);
    let repository = repositories.get(identityKey);
    if (!repository) {
      repository = createRepositoryWatch(identity, identityKey);
      repositories.set(identityKey, repository);
      armRepositoryWatchers(repository);
    }

    repository.clients.set(subscriptionId, sender);
    subscriptions.set(subscriptionId, {
      kind: "repository",
      senderId: sender.id,
      sender,
      workspaceRoot: identity.topLevel,
      identityKey,
    });

    logger.info?.("git metadata watch started", {
      subscriptionId,
      rootPath: identity.topLevel,
      gitDir: identity.gitDir,
      commonDir: identity.commonDir,
      watching: repository.watchTargets.map((target) => target.label),
    });

    return { subscriptionId, rootPath: identity.topLevel, repository: true };
  }

  function stop(subscriptionId, expectedSenderId = null) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription) return { ok: true };
    if (expectedSenderId !== null && subscription.senderId !== expectedSenderId) {
      return { ok: true };
    }
    subscriptions.delete(subscriptionId);

    if (subscription.kind === "pending") {
      const pending = pendingRoots.get(subscription.workspaceRoot);
      if (pending) {
        pending.subscriptionIds.delete(subscriptionId);
        if (pending.subscriptionIds.size === 0) {
          disposePendingRootWatch(subscription.workspaceRoot);
        }
      }
      return { ok: true };
    }

    const repository = repositories.get(subscription.identityKey);
    if (!repository) return { ok: true };

    repository.clients.delete(subscriptionId);
    if (repository.clients.size === 0) {
      disposeRepositoryWatch(repository);
      repositories.delete(subscription.identityKey);
    }
    return { ok: true };
  }

  function stopForWindow(webContentsId) {
    for (const [subscriptionId, subscription] of Array.from(subscriptions.entries())) {
      if (subscription.senderId === webContentsId) stop(subscriptionId);
    }
  }

  function closeAll() {
    for (const repository of repositories.values()) {
      disposeRepositoryWatch(repository);
    }
    for (const root of Array.from(pendingRoots.keys())) {
      disposePendingRootWatch(root);
    }
    repositories.clear();
    subscriptions.clear();
    commonDirWatchers.clear();
    pendingRoots.clear();
  }

  function getWatcherCount() {
    return repositories.size;
  }

  function getPendingRootCount() {
    return pendingRoots.size;
  }

  function createRepositoryWatch(identity, identityKey) {
    return {
      identity,
      identityKey,
      clients: new Map(),
      watchTargets: buildWatchTargets(identity),
      watchers: [],
      debounceTimer: null,
      pendingReason: null,
      rearmTimer: null,
      rearmDelay: GIT_METADATA_REARM_MIN_DELAY_MS,
      disposed: false,
    };
  }

  function armPendingRootWatch(workspaceRoot) {
    if (pendingRoots.has(workspaceRoot)) return;
    const entry = {
      subscriptionIds: new Set(),
      watcher: null,
      rearmTimer: null,
      rearmDelay: GIT_METADATA_REARM_MIN_DELAY_MS,
      disposed: false,
    };
    pendingRoots.set(workspaceRoot, entry);
    armPendingWatcher(workspaceRoot, entry);
  }

  function armPendingWatcher(workspaceRoot, entry) {
    if (entry.disposed) return;
    if (entry.watcher) {
      try {
        entry.watcher.close();
      } catch {
        // Best-effort.
      }
      entry.watcher = null;
    }
    try {
      if (!fsModule.existsSync(workspaceRoot)) {
        schedulePendingRearm(workspaceRoot, entry);
        return;
      }
      entry.watcher = fsModule.watch(
        workspaceRoot,
        { recursive: false, persistent: false },
        (_eventType, filename) => {
          const normalized = filename ? String(filename).replaceAll("\\", "/") : "";
          if (normalized !== ".git" && !normalized.startsWith(".git/") && normalized !== "") return;
          void promotePendingRoot(workspaceRoot, "repository-initialized");
        },
      );
      entry.watcher.on("error", (error) => {
        logger.warn?.("pending git root watcher error; scheduling re-arm", {
          rootPath: workspaceRoot,
          message: error instanceof Error ? error.message : String(error),
        });
        schedulePendingRearm(workspaceRoot, entry);
      });
      entry.rearmDelay = GIT_METADATA_REARM_MIN_DELAY_MS;
    } catch (error) {
      logger.warn?.("unable to arm pending git root watcher", {
        rootPath: workspaceRoot,
        message: error instanceof Error ? error.message : String(error),
      });
      schedulePendingRearm(workspaceRoot, entry);
    }
  }

  function schedulePendingRearm(workspaceRoot, entry) {
    if (entry.disposed || entry.rearmTimer) return;
    const delay = entry.rearmDelay;
    entry.rearmDelay = Math.min(entry.rearmDelay * 2, GIT_METADATA_REARM_MAX_DELAY_MS);
    entry.rearmTimer = setTimeout(() => {
      entry.rearmTimer = null;
      armPendingWatcher(workspaceRoot, entry);
    }, delay);
    if (typeof entry.rearmTimer.unref === "function") entry.rearmTimer.unref();
  }

  async function promotePendingRoot(workspaceRoot, reason) {
    const pending = pendingRoots.get(workspaceRoot);
    if (!pending || pending.subscriptionIds.size === 0) return;

    const identity = await resolveIdentity(workspaceRoot);
    if (!identity.repository || !identity.gitDir) return;

    const subscriptionIds = Array.from(pending.subscriptionIds);
    disposePendingRootWatch(workspaceRoot);

    for (const subscriptionId of subscriptionIds) {
      const subscription = subscriptions.get(subscriptionId);
      if (!subscription || subscription.kind !== "pending") continue;
      attachRepositorySubscription({
        subscriptionId,
        sender: subscription.sender,
        identity,
      });
      broadcastToSubscription(subscriptionId, identity.topLevel, reason);
    }

    logger.info?.("git metadata watch promoted after repository initialization", {
      rootPath: identity.topLevel,
      reason,
      subscriptions: subscriptionIds.length,
    });
  }

  function armRepositoryWatchers(repository) {
    if (repository.disposed) return;
    for (const watcher of repository.watchers.splice(0)) {
      try {
        watcher.close();
      } catch {
        // Best-effort close.
      }
    }
    unbindCommonDir(repository);

    let armedAny = false;
    for (const target of repository.watchTargets) {
      if (target.sharedCommon) {
        if (bindCommonDir(repository, target)) armedAny = true;
        continue;
      }
      try {
        if (!fsModule.existsSync(target.dir)) continue;
        const watcher = fsModule.watch(
          target.dir,
          { recursive: target.recursive === true, persistent: false },
          (eventType, filename) => handleRawEvent(repository, target, eventType, filename),
        );
        watcher.on("error", (error) => {
          logger.warn?.("git metadata watcher error; scheduling re-arm", {
            dir: target.label,
            rootPath: repository.identity.topLevel,
            message: error instanceof Error ? error.message : String(error),
          });
          scheduleRearm(repository, "watcher-error");
        });
        repository.watchers.push(watcher);
        armedAny = true;
      } catch (error) {
        logger.warn?.("unable to arm git metadata watcher", {
          dir: target.label,
          rootPath: repository.identity.topLevel,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (armedAny) {
      repository.rearmDelay = GIT_METADATA_REARM_MIN_DELAY_MS;
    } else {
      scheduleRearm(repository, "watcher-recovered");
    }
  }

  function bindCommonDir(repository, target) {
    const commonDir = target.dir;
    let shared = commonDirWatchers.get(commonDir);
    if (!shared) {
      try {
        if (!fsModule.existsSync(commonDir)) return false;
        const watcher = fsModule.watch(
          commonDir,
          { recursive: target.recursive === true, persistent: false },
          (eventType, filename) => {
            const current = commonDirWatchers.get(commonDir);
            if (!current) return;
            for (const identityKey of Array.from(current.repositories)) {
              const repo = repositories.get(identityKey);
              if (!repo || repo.disposed) continue;
              handleRawEvent(repo, target, eventType, filename);
            }
          },
        );
        watcher.on("error", (error) => {
          logger.warn?.("shared git common-dir watcher error; scheduling re-arm", {
            dir: commonDir,
            message: error instanceof Error ? error.message : String(error),
          });
          const current = commonDirWatchers.get(commonDir);
          if (!current) return;
          for (const identityKey of Array.from(current.repositories)) {
            const repo = repositories.get(identityKey);
            if (repo) scheduleRearm(repo, "watcher-error");
          }
        });
        shared = { watcher, repositories: new Set(), target };
        commonDirWatchers.set(commonDir, shared);
      } catch (error) {
        logger.warn?.("unable to arm shared git common-dir watcher", {
          dir: commonDir,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }
    shared.repositories.add(repository.identityKey);
    repository.sharedCommonDirs = repository.sharedCommonDirs ?? new Set();
    repository.sharedCommonDirs.add(commonDir);
    return true;
  }

  function unbindCommonDir(repository) {
    for (const commonDir of Array.from(repository.sharedCommonDirs ?? [])) {
      const shared = commonDirWatchers.get(commonDir);
      if (!shared) continue;
      shared.repositories.delete(repository.identityKey);
      if (shared.repositories.size === 0) {
        try {
          shared.watcher.close();
        } catch {
          // Best-effort.
        }
        commonDirWatchers.delete(commonDir);
      }
    }
    repository.sharedCommonDirs = new Set();
  }

  function scheduleRearm(repository, reason = "watcher-recovered") {
    if (repository.disposed || repository.rearmTimer) return;
    const delay = repository.rearmDelay;
    repository.rearmDelay = Math.min(repository.rearmDelay * 2, GIT_METADATA_REARM_MAX_DELAY_MS);
    logger.info?.("git metadata watcher re-arm scheduled", {
      rootPath: repository.identity.topLevel,
      delayMs: delay,
      reason,
    });
    repository.rearmTimer = setTimeout(() => {
      repository.rearmTimer = null;
      armRepositoryWatchers(repository);
      broadcastInvalidation(repository, reason);
    }, delay);
    if (typeof repository.rearmTimer.unref === "function") repository.rearmTimer.unref();
  }

  function handleRawEvent(repository, target, eventType, filename) {
    if (repository.disposed) return;
    const normalized = filename ? String(filename).replaceAll("\\", "/") : "";
    if (shouldIgnoreMetadataChange(normalized)) return;

    const reason = classifyMetadataReason(target, normalized);
    repository.pendingReason = reason;

    if (eventType === "rename" && (normalized === "" || target.recursive !== true)) {
      scheduleRearm(repository, "watcher-recovered");
    }

    if (repository.debounceTimer) return;
    repository.debounceTimer = setTimeout(() => {
      repository.debounceTimer = null;
      const nextReason = repository.pendingReason ?? "git-metadata";
      repository.pendingReason = null;
      logger.info?.("git metadata invalidated", {
        rootPath: repository.identity.topLevel,
        reason: nextReason,
        clients: repository.clients.size,
      });
      broadcastInvalidation(repository, nextReason);
    }, GIT_METADATA_INVALIDATION_DEBOUNCE_MS);
    if (typeof repository.debounceTimer.unref === "function") repository.debounceTimer.unref();
  }

  function broadcastInvalidation(repository, reason) {
    const rootPath = repository.identity.topLevel;
    for (const [subscriptionId, sender] of Array.from(repository.clients.entries())) {
      if (typeof sender.isDestroyed === "function" && sender.isDestroyed()) {
        repository.clients.delete(subscriptionId);
        continue;
      }
      try {
        sender.send(GIT_REPOSITORY_INVALIDATED_CHANNEL, { subscriptionId, rootPath, reason });
      } catch (error) {
        logger.warn?.("unable to deliver git metadata invalidation", {
          rootPath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  function broadcastToSubscription(subscriptionId, rootPath, reason) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription?.sender) return;
    if (typeof subscription.sender.isDestroyed === "function" && subscription.sender.isDestroyed()) return;
    try {
      subscription.sender.send(GIT_REPOSITORY_INVALIDATED_CHANNEL, { subscriptionId, rootPath, reason });
    } catch (error) {
      logger.warn?.("unable to deliver git metadata promotion invalidation", {
        rootPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function disposePendingRootWatch(workspaceRoot) {
    const entry = pendingRoots.get(workspaceRoot);
    if (!entry) return;
    entry.disposed = true;
    clearTimeout(entry.rearmTimer);
    entry.rearmTimer = null;
    if (entry.watcher) {
      try {
        entry.watcher.close();
      } catch {
        // Best-effort.
      }
    }
    pendingRoots.delete(workspaceRoot);
  }

  function disposeRepositoryWatch(repository) {
    repository.disposed = true;
    clearTimeout(repository.debounceTimer);
    clearTimeout(repository.rearmTimer);
    repository.debounceTimer = null;
    repository.rearmTimer = null;
    unbindCommonDir(repository);
    for (const watcher of repository.watchers.splice(0)) {
      try {
        watcher.close();
      } catch {
        // Best-effort close.
      }
    }
    repository.clients.clear();
  }

  return {
    start,
    stop,
    stopForWindow,
    closeAll,
    getWatcherCount,
    getPendingRootCount,
    // Test seam: force a pending root to re-check for repository creation.
    promotePendingRootForTests: promotePendingRoot,
  };
}

function buildIdentityKey(identity) {
  return [identity.topLevel, identity.gitDir, identity.commonDir]
    .map((value) => (value ? path.resolve(value) : ""))
    .join("\u0000");
}

function buildWatchTargets(identity) {
  const targets = [];
  const seen = new Set();
  const add = (dir, options) => {
    if (!dir) return;
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    targets.push({ dir: resolved, label: resolved, ...options });
  };

  // Worktree-specific git dir: index, HEAD, FETCH_HEAD, merge/rebase/cherry-pick.
  add(identity.gitDir, { recursive: false });

  const commonDir = identity.commonDir ? path.resolve(identity.commonDir) : null;
  const gitDir = path.resolve(identity.gitDir);
  if (commonDir && commonDir !== gitDir) {
    // Shared common dir is reference-counted across linked worktrees.
    add(commonDir, { recursive: false, sharedCommon: true });
    add(path.join(commonDir, "refs"), { recursive: true, sharedCommon: true });
  } else {
    add(path.join(gitDir, "refs"), { recursive: true });
  }
  return targets;
}

function shouldIgnoreMetadataChange(normalized) {
  if (!normalized) return false;
  if (normalized.endsWith(".lock")) return true;
  if (normalized === "index.lock") return true;
  if (normalized === "objects" || normalized.startsWith("objects/")) return true;
  if (normalized.includes("cookies") || normalized.endsWith(".cookie")) return true;
  return false;
}

function classifyMetadataReason(target, normalized) {
  const base = normalized.split("/").pop() ?? normalized;
  if (base === "index") return "index";
  if (base === "HEAD" || normalized.startsWith("refs") || target.label.endsWith(`${path.sep}refs`) || target.label.endsWith("/refs")) {
    return "ref";
  }
  if (base === "packed-refs") return "ref";
  if (base === "config") return "config";
  if (base === "FETCH_HEAD") return "fetch";
  if (
    base === "MERGE_HEAD"
    || base === "ORIG_HEAD"
    || base === "CHERRY_PICK_HEAD"
    || base === "REVERT_HEAD"
    || normalized.startsWith("rebase-")
    || base === "MERGE_MSG"
  ) {
    return "merge";
  }
  return "git-metadata";
}
