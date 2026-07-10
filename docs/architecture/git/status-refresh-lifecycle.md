# Repository Status Refresh Lifecycle

Architecture home: [Git and Source Control Architecture](README.md). The
snapshot consumer and sidebar state model are documented in
[Local Source Control Sidebar](local-source-control-sidebar.md).

## Status

- **Current implementation:** Implemented with a known correctness gap.
- **Target lifecycle:** Proposed. The watcher, scheduler, query split, and tests
  described under Target Architecture are not current behavior until their code
  changes land.

This distinction is intentional. The document records the present failure
without turning it into a durable architecture rule, and defines the contract
the implementation must satisfy next.

## Requirement

The local Git snapshot must eventually match repository truth after changes made
by:

- PuppyOne Git actions
- the PuppyOne integrated terminal
- an external terminal or Git client
- hooks, background tools, and ref updates

The UI may debounce and coalesce work, but it must not remain stale indefinitely
or require a workspace reload. The same freshness contract applies to the Git
sidebar, navigation badge, titlebar branch state, Cloud Git summaries, and any
other consumer of the active snapshot.

Filesystem notifications are only invalidation hints. Git status remains the
source of truth.

Window ownership and watcher cleanup remain governed by
[Desktop Multi-Window Workspaces](../desktop-multi-window-workspaces.md).

## Implemented Lifecycle

### Initial and application-owned updates

`useDesktopGitController` reads status when the active local workspace changes.
Application-owned Git operations return a new `GitStatusSnapshot` and update the
controller directly, so stage, commit, checkout, pull, push, and related actions
started in the UI normally refresh immediately.

### External workspace updates

The current external-change path is:

```text
fs.watch(workspace root, recursive)
              |
              v
electron/main/workspace-watch-service.mjs
              |
              v
       workspace:changed
              |
              v
window.puppyoneDesktop.watchWorkspace
              |
              v
      useWorkspaceFileWatch
          /           \
         v             v
refresh Explorer   refresh Git status
```

The main-process watcher applies a 200 ms debounce and shares a watcher among
windows that subscribe to the same canonical root.

### Implemented exclusion

Before broadcasting, the watcher discards every event whose relative path is
`.git` or starts with `.git/`. That exclusion is appropriate for Explorer
refresh and AI edit-review input, but it also removes the renderer's only
automatic Git invalidation signal for metadata-only changes.

### Focus and error behavior

The main process records the last-focused time when an Electron window gains
focus, but it does not currently request a Git reconcile.

Watcher errors are broadcast as `workspace:changed` error events. The renderer
does not refresh, report, retry, or fall back when such an event arrives.

## Known Failure

A normal external commit can follow this sequence:

1. A tracked workspace file changes.
2. The non-Git workspace watcher event refreshes the UI, which displays the file
   as unstaged.
3. An external process runs `git add`. Git changes the repository index.
4. The external process runs `git commit`. Git updates index, refs, logs, and
   other repository metadata.
5. Those metadata events are all discarded by the `.git/**` exclusion.
6. No later event calls `refreshGitStatus`, so the pre-commit snapshot remains
   visible.

The same gap affects external stage/unstage, `reset --soft`, fetch, ref-only
branch changes, and other operations that do not modify a visible working-tree
file after the last rendered snapshot.

The Git reader itself is not a persistent cache. A manual status request runs
new Git commands and returns current repository truth. The defect is missing
invalidation and reconciliation.

## Target Architecture

The target lifecycle follows the repository-scoped design used by mature Git
clients:

```text
WorkingTreeWatcher --------\
GitMetadataWatcher ---------+--> GitRefreshScheduler --> FastGitStatusReader
PuppyOne Git operations ----+              |                    |
Integrated terminal signal -+              |                    v
Manual refresh -------------/              +------------> GitStatusSnapshot
Window focus fallback ------/
```

### 1. Separate working-tree and Git-metadata events

`WorkspaceContentWatcher` continues to watch normal workspace files and feed
Explorer and edit-review consumers. It continues to exclude Git metadata.

`GitMetadataWatcher` is a separate main-process service. Its events invalidate
only repository state and must not refresh Explorer or enter edit-review.

Removing the existing `.git/**` exclusion without separating consumers is not an
acceptable fix. Recursive object, lock, log, and hook activity would create
unrelated Explorer work and status-refresh storms.

### 2. Resolve repository paths through Git

The renderer must not provide an arbitrary metadata path. After main-process
workspace authorization, the Git service resolves repository-owned paths with
Git, including:

- the worktree-specific Git directory
- the shared/common Git directory
- the repository top level when the opened folder is inside a parent repository

The implementation should use `git rev-parse --git-dir --git-common-dir` with
absolute path normalization. This covers linked worktrees and repositories where
`.git` is a file pointing outside the workspace.

Derived Git paths inherit authority from the authorized repository root; they
are never accepted as renderer-supplied filesystem capabilities.

### 3. Watch narrow metadata surfaces

The Git watcher should treat metadata events as invalidation, not attempt to
derive status from filenames. Relevant surfaces include:

- worktree Git-directory first-level files such as `index`, `HEAD`,
  `FETCH_HEAD`, and merge/rebase/cherry-pick state
- shared/common Git-directory state such as `packed-refs`, `config`, ref
  directories, or the current upstream ref
- configuration changes that affect remotes, upstreams, or repository behavior

Noise such as `index.lock`, object writes, and watcher-cookie files should not
independently trigger repeated status reads.

The watcher must re-arm when watched files are atomically replaced, paths are
deleted and recreated, or an error invalidates the underlying Node watcher.

### 4. Register before the initial snapshot

Subscription setup must close the startup race:

1. Authorize the workspace root.
2. Resolve Git paths.
3. Create the content and metadata watchers.
4. Return a ready subscription token/generation.
5. Read the initial Git snapshot.
6. Deliver later invalidations through that subscription.

Cleanup is token-based or reference-counted. A React Strict Mode setup/cleanup
cycle must not let an old asynchronous `watch-stop` remove a newer subscription
for the same `webContents`.

### 5. Use one refresh scheduler per active repository

`GitRefreshScheduler` owns coalescing and request order:

- debounce bursts of filesystem events
- allow only one status read in flight
- while a read is active, set a dirty flag rather than starting unlimited reads
- after completion, run at most one trailing refresh when dirty
- associate results with a monotonically increasing generation
- never commit an older generation over a newer snapshot
- keep loading state tied to the active generation

Application mutations may request an immediate reconcile, but they still pass
through the same ordering rules.

### 6. Gate background work and reconcile on focus

When the window is not visible or focused, a received invalidation may remain
dirty without immediately running status. Focus or visibility restoration drains
the queued refresh.

PuppyOne uses raw Node filesystem watchers rather than VS Code's full watcher
service, so focus is also a bounded correctness fallback: if the last successful
status is older than the freshness threshold, focus performs a reconcile even
when no event survived. It should not continuously poll while the app is hidden.

Manual Refresh remains available in the normal Git surface and bypasses the
debounce while preserving single-flight ordering.

### 7. Keep the frequent query lightweight

The hot-path status reader should load only data needed to reconcile the Source
Control surface:

- HEAD and branch/upstream identity
- staged, unstaged, untracked, and merge resources
- ahead/behind and relevant refs/remotes
- repository operation state needed by current actions

Full current-branch and all-branch histories are loaded lazily by the History
surface, paginated, and invalidated when HEAD or relevant refs change. A normal
file save must not run two complete history scans.

### 8. Avoid background index writes

Read-only background status uses `GIT_OPTIONAL_LOCKS=0` (or Git's equivalent
`--no-optional-locks` invocation). This prevents a background status query from
performing an optional index refresh, competing with terminal Git operations, or
creating a metadata event feedback loop.

This environment is scoped to background/read-only queries. Mutating Git
commands retain their normal locking behavior.

### 9. Treat errors as observable state

Watcher and refresh failures must:

- be logged with repository and watcher context
- preserve the last good snapshot rather than replacing it with unrelated data
- schedule bounded retry/re-arm with backoff
- expose a manual retry path
- use focus reconciliation as a fallback

Repeated errors must not create a tight retry loop.

## Application and Terminal Signals

PuppyOne-owned Git actions reconcile directly when they settle; they do not wait
for filesystem notification.

A future integrated-terminal command-completion signal may immediately dirty the
repository after successful state-changing Git commands such as `add`, `commit`,
`fetch`, `reset`, `checkout`, `pull`, `push`, `rebase`, or `stash`. External
Terminal applications continue to rely on metadata watchers and focus fallback.

Terminal parsing is an optimization, not the sole correctness mechanism.

## Snapshot Consistency

The current status reader executes several Git commands concurrently. An
external mutation can occur between those commands and produce a mixed snapshot.

At minimum, generation ordering prevents an old request from overwriting a new
one. The implementation may additionally compare a cheap HEAD/index/ref
fingerprint before and after a multi-command read and retry once when repository
identity changes during the query.

## Verification Matrix

Automated tests use real temporary Git repositories and eventual predicates
rather than fixed sleeps.

Required coverage:

- edit a tracked file, externally add and commit it, then observe a clean
  snapshot with a new HEAD
- externally stage and unstage without another working-tree edit
- externally run `reset --soft`
- fetch or update a remote-tracking ref
- switch branches whose trees are identical
- initialize Git after the workspace watcher has started
- linked worktree with separate Git and common directories
- packed refs and nested branch names
- merge, rebase, and cherry-pick state-file changes
- watcher failure, path replacement, re-arm, and bounded retry
- window focus drains a queued invalidation
- stale-focus fallback reconciles a deliberately missed event
- React Strict Mode setup/cleanup does not remove the active subscription
- rapid events produce one in-flight read and at most one trailing read
- an older delayed response cannot overwrite a newer generation
- frequent working-tree events do not reload full history
- application Git actions settle with a reconciled snapshot

Manual verification should cover an external Terminal application because the
integrated terminal may have a direct completion signal that masks watcher
defects.

## Reference Design

The target borrows principles from the VS Code Git extension while retaining
PuppyOne's one-repository-per-window product model:

- VS Code separates working-tree and dot-Git watchers:
  <https://github.com/microsoft/vscode/blob/2025e5baac319d7791353032fb3afd906758a898/extensions/git/src/repository.ts#L920-L948>
- It resolves Git and common directories through `rev-parse`:
  <https://github.com/microsoft/vscode/blob/2025e5baac319d7791353032fb3afd906758a898/extensions/git/src/git.ts#L560-L593>
- It debounces, waits for repository idle/focus, throttles, and retains a
  trailing refresh:
  <https://github.com/microsoft/vscode/blob/2025e5baac319d7791353032fb3afd906758a898/extensions/git/src/repository.ts#L3171-L3219>
- It disables optional locks for background status:
  <https://github.com/microsoft/vscode/blob/2025e5baac319d7791353032fb3afd906758a898/extensions/git/src/git.ts#L2738-L2767>

PuppyOne adds a stale-focus reconcile and watcher re-arm requirement because it
currently uses Node `fs.watch` directly instead of VS Code's complete file
watcher service.

## Target Invariants

- Working-tree content and Git metadata have separate invalidation channels.
- The real Git directory is resolved, never assumed to be `<workspace>/.git`.
- A watcher event never becomes repository truth by itself.
- External Git changes eventually reconcile without reopening the workspace.
- At most one status read per repository is in flight.
- One trailing refresh preserves changes that occur during an active read.
- Older results never overwrite a newer generation.
- Background status does not take optional Git locks.
- Watcher errors are observable and recoverable.
- Focus provides bounded reconciliation without hidden-window polling.
- Frequent status refresh does not reload complete Git history.
