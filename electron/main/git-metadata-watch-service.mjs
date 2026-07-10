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
//   - Events are invalidation hints only. Noise (index.lock, objects/, watcher
//     cookies) is filtered so it does not trigger repeated status reads.
//   - Node fs.watch is fragile: we re-arm on replace/delete/error with bounded
//     exponential backoff (250ms -> 30s).

import fs from "node:fs";
import path from "node:path";
import { resolveGitRepositoryIdentity as defaultResolveIdentity } from "../../local-api/workspace.mjs";

export const GIT_REPOSITORY_INVALIDATED_CHANNEL = "git-repository:invalidated";

const INVALIDATION_DEBOUNCE_MS = 120;
const REARM_MIN_DELAY_MS = 250;
const REARM_MAX_DELAY_MS = 30000;

let subscriptionSequence = 0;

export function createGitMetadataWatchService({
  logger = console,
  resolveIdentity = defaultResolveIdentity,
  fsModule = fs,
} = {}) {
  // Keyed by canonical repository identity so that multiple windows watching
  // the same repository share one set of OS watchers.
  const repositories = new Map();
  // subscriptionId -> { identityKey, senderId }
  const subscriptions = new Map();

  async function start(sender, rootPath) {
    const identity = await resolveIdentity(rootPath);
    const subscriptionId = `git-watch-${(subscriptionSequence += 1)}-${Date.now().toString(36)}`;

    if (!identity.repository || !identity.gitDir) {
      // Not a repository (yet). Return a resolved subscription without watchers;
      // the renderer still reads an initial snapshot and can rely on the content
      // watcher / focus fallback until Git is initialized.
      return { subscriptionId, rootPath: identity.workspaceRoot, repository: false };
    }

    const identityKey = buildIdentityKey(identity);
    let repository = repositories.get(identityKey);
    if (!repository) {
      repository = createRepositoryWatch(identity, identityKey);
      repositories.set(identityKey, repository);
      armRepositoryWatchers(repository);
    }

    repository.clients.set(subscriptionId, sender);
    subscriptions.set(subscriptionId, { identityKey, senderId: sender.id });

    if (typeof sender.once === "function") {
      sender.once("destroyed", () => stop(subscriptionId));
    }

    logger.info?.("git metadata watch started", {
      subscriptionId,
      rootPath: identity.topLevel,
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
    repositories.clear();
    subscriptions.clear();
  }

  function getWatcherCount() {
    return repositories.size;
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
      rearmDelay: REARM_MIN_DELAY_MS,
      disposed: false,
    };
  }

  function armRepositoryWatchers(repository) {
    if (repository.disposed) return;
    // Close any existing watchers before re-arming.
    for (const watcher of repository.watchers.splice(0)) {
      try {
        watcher.close();
      } catch {
        // Best-effort close; a failed watcher may already be gone.
      }
    }

    let armedAny = false;
    for (const target of repository.watchTargets) {
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
            message: error instanceof Error ? error.message : String(error),
          });
          scheduleRearm(repository);
        });
        repository.watchers.push(watcher);
        armedAny = true;
      } catch (error) {
        logger.warn?.("unable to arm git metadata watcher", {
          dir: target.label,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (armedAny) {
      // Successful arm resets the backoff.
      repository.rearmDelay = REARM_MIN_DELAY_MS;
    } else {
      scheduleRearm(repository);
    }
  }

  function scheduleRearm(repository) {
    if (repository.disposed || repository.rearmTimer) return;
    const delay = repository.rearmDelay;
    repository.rearmDelay = Math.min(repository.rearmDelay * 2, REARM_MAX_DELAY_MS);
    repository.rearmTimer = setTimeout(() => {
      repository.rearmTimer = null;
      armRepositoryWatchers(repository);
    }, delay);
    if (typeof repository.rearmTimer.unref === "function") repository.rearmTimer.unref();
  }

  function handleRawEvent(repository, target, eventType, filename) {
    if (repository.disposed) return;
    const normalized = filename ? String(filename).replaceAll("\\", "/") : "";
    if (shouldIgnoreMetadataChange(normalized)) return;

    const reason = classifyMetadataReason(target, normalized);
    repository.pendingReason = reason;

    // A rename on a watched root (atomic replace / delete+recreate) can drop the
    // underlying watch; re-arm defensively.
    if (eventType === "rename" && (normalized === "" || target.recursive !== true)) {
      scheduleRearm(repository);
    }

    if (repository.debounceTimer) return;
    repository.debounceTimer = setTimeout(() => {
      repository.debounceTimer = null;
      broadcastInvalidation(repository, repository.pendingReason ?? "git-metadata");
      repository.pendingReason = null;
    }, INVALIDATION_DEBOUNCE_MS);
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
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  function disposeRepositoryWatch(repository) {
    repository.disposed = true;
    clearTimeout(repository.debounceTimer);
    clearTimeout(repository.rearmTimer);
    repository.debounceTimer = null;
    repository.rearmTimer = null;
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
  };
}

function buildIdentityKey(identity) {
  return [identity.topLevel, identity.gitDir, identity.commonDir]
    .map((value) => (value ? path.resolve(value) : ""))
    .join("\u0000");
}

// The metadata watcher watches the worktree Git directory and the shared common
// directory. It deliberately does NOT recursively watch the whole worktree
// (that is the content watcher's job) — only Git-owned metadata surfaces.
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

  // Worktree git dir: index, HEAD, FETCH_HEAD, ORIG_HEAD, and merge/rebase/
  // cherry-pick state files live at the top level.
  add(identity.gitDir, { recursive: false });
  // Shared/common git dir: packed-refs, config, and the refs/ tree. Recursive so
  // nested branch names (refs/heads/feature/x) and remote-tracking refs invalidate.
  if (identity.commonDir && path.resolve(identity.commonDir) !== path.resolve(identity.gitDir)) {
    add(identity.commonDir, { recursive: false });
    add(path.join(identity.commonDir, "refs"), { recursive: true });
  } else {
    add(path.join(identity.gitDir, "refs"), { recursive: true });
  }
  return targets;
}

function shouldIgnoreMetadataChange(normalized) {
  if (!normalized) return false;
  // index.lock and other transient *.lock files churn on every Git command.
  if (normalized.endsWith(".lock")) return true;
  if (normalized === "index.lock") return true;
  // Object writes are high-volume noise, not status-relevant on their own.
  if (normalized === "objects" || normalized.startsWith("objects/")) return true;
  // Watcher cookies / fsmonitor sockets.
  if (normalized.includes("cookies") || normalized.endsWith(".cookie")) return true;
  return false;
}

function classifyMetadataReason(target, normalized) {
  const base = normalized.split("/").pop() ?? normalized;
  if (base === "index") return "index";
  if (base === "HEAD" || normalized.startsWith("refs") || target.label.endsWith("refs")) return "ref";
  if (base === "packed-refs") return "ref";
  if (base === "config") return "config";
  if (base === "FETCH_HEAD") return "fetch";
  if (
    base === "MERGE_HEAD" ||
    base === "ORIG_HEAD" ||
    base === "CHERRY_PICK_HEAD" ||
    base === "REVERT_HEAD" ||
    normalized.startsWith("rebase-") ||
    base === "MERGE_MSG"
  ) {
    return "merge";
  }
  return "git-metadata";
}
