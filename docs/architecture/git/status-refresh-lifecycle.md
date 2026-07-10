# Repository Status Refresh Lifecycle

Architecture home: [Git and Source Control Architecture](README.md). The
snapshot consumer and sidebar state model are documented in
[Local Source Control Sidebar](local-source-control-sidebar.md).

## Status

- **Lifecycle:** Implemented.
- The watcher, scheduler, query split, focus fallback, recovery, and verification
  matrix described under Target Architecture are current behavior.
- Workspace switches are isolated by a monotonic `rootEpoch`; delayed reads from
  a previous root cannot publish into the active repository.
- Physical single-flight is preserved across mutation snapshots: an in-flight
  status promise remains counted until it settles, even when it is no longer
  publishable.
- Initial snapshot waits for both content and metadata watcher readiness.
- Historical diagnosis of the pre-fix stale-status gap is retained below for
  rationale; it is no longer the product contract.

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

## Current Architecture

The lifecycle follows the repository-scoped design used by mature Git clients:

```text
WorkingTreeWatcher --------\
GitMetadataWatcher ---------+--> GitRefreshScheduler --> FastGitStatusReader
PuppyOne Git operations ----+              |                    |
Integrated terminal signal -+              |                    v
Manual refresh -------------/              +------------> GitStatusSnapshot
Window focus fallback ------/
```

### Initial and application-owned updates

`useDesktopGitController` starts the authorized Git metadata subscription, then
reads the initial snapshot only after that subscription is ready.
Application-owned Git operations return a new `GitStatusSnapshot` and publish it
through `GitRefreshScheduler.applyMutationSnapshot`, so stage, commit, checkout,
pull, push, and related actions settle with generation-ordered reconciliation.

### External invalidation channels

Working-tree content and Git metadata are separate channels:

```text
fs.watch(workspace root, recursive)          GitMetadataWatcher (.git surfaces)
              |                                         |
              v                                         v
workspace-watch-service.mjs              git-metadata-watch-service.mjs
              |                                         |
       workspace:changed                     git-repository:invalidated
              |                                         |
              v                                         v
   useWorkspaceFileWatch                    useDesktopGitController
          /           \                                 |
         v             v                                v
   refresh Explorer   dirty scheduler <------ GitRefreshScheduler
```

The content watcher continues to exclude `.git/**` so Explorer and edit-review
never ingest Git metadata noise. The metadata watcher resolves repository paths
through Git (`--show-toplevel`, `--git-dir`, `--git-common-dir`), watches
worktree-specific and common-dir surfaces, filters lock/object/cookie noise, and
re-arms with bounded backoff. Non-repository folders keep a pending root watch
that promotes into a full metadata watch after `git init`.

### Scheduler, focus, and errors

`GitRefreshScheduler` owns debounce (250 ms), single-flight reads, dirty trailing
refresh, generation ordering, focus/visibility drain, and stale-focus reconcile
(5 s). The Electron main process emits `git-repository:window-focus` on
BrowserWindow focus/blur so the scheduler is not limited to DOM focus alone.
Transient refresh failures preserve the last good snapshot, record an error,
and leave manual Refresh available. Watcher and refresh paths log repository
identity, reason, and duration without credentials or remote secrets.

### Fast status and lazy history

Frequent status reads omit current-branch and all-branch history. Porcelain-v2
`--branch` headers supply HEAD/branch identity when present so duplicate Git
queries are avoided. A HEAD/symbolic-ref/index fingerprint is compared before
and after the multi-command read; one retry runs when identity changes mid-query.
History and Cloud branch graphs load through `getWorkspaceGitBranchGraph` when
those surfaces are active, and cached history is dropped on ref/fetch/merge/
config metadata invalidation. Background read-only status sets
`GIT_OPTIONAL_LOCKS=0`; mutating commands keep normal locks.

## Historical Failure (pre-fix)

Before the metadata watcher and scheduler landed, a normal external commit could
follow this sequence:

1. A tracked workspace file changes.
2. The non-Git workspace watcher event refreshes the UI, which displays the file
   as unstaged.
3. An external process runs `git add`. Git changes the repository index.
4. The external process runs `git commit`. Git updates index, refs, logs, and
   other repository metadata.
5. Those metadata events were all discarded by the `.git/**` content-watch
   exclusion.
6. No later event refreshed Git status, so the pre-commit snapshot remained
   visible.

The same gap affected external stage/unstage, `reset --soft`, fetch, ref-only
branch changes, and other operations that do not modify a visible working-tree
file after the last rendered snapshot.

The Git reader itself was not a persistent cache. A manual status request ran
new Git commands and returned current repository truth. The defect was missing
invalidation and reconciliation.

### Why the failure appeared intermittent

The 200 ms workspace-event debounce made the defect timing-dependent, not
random.

If an external `git add` and `git commit` both finished before the debounced
working-tree event started its status read, that read observed the post-commit
repository and the UI appeared correct. If the status read finished after the
file edit but before the metadata-only operations, it published the pre-commit
snapshot; the later index and ref events were excluded, so that snapshot remained
visible. A later ordinary file change, application-owned Git operation, manual
refresh, or workspace reload could make the UI catch up and further obscure the
cause.

An automated reproduction must therefore wait until the edited-file snapshot is
visible before running the external metadata-only operation. Tests that perform
edit, add, and commit in one uninterrupted burst can pass accidentally because
the single delayed refresh runs after the whole burst.

## Target Architecture (now current)

The sections below remain the permanent contract. They originally described the
accepted target; they are now the implemented architecture.

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

The status reader executes several Git commands. An external mutation can occur
between those commands and produce a mixed snapshot.

Generation ordering prevents an old request from overwriting a new one. The
fast status reader also compares a cheap HEAD / symbolic-ref / index fingerprint
before and after the multi-command read and retries once when repository
identity changes during the query.

## Implementation Handoff

This section is the execution contract for the agent implementing the target
architecture. The diagnosis and architectural direction are settled; an
implementing agent should begin with the failing lifecycle tests and should not
replace the design with polling or an undifferentiated recursive watcher.

The implementation scope is local PuppyOne Desktop Git freshness for the active
repository. It must preserve the existing Source Control UI, main-process
workspace authorization, one-repository-per-window ownership, and Cloud-facing
snapshot consumers.

### Accepted ownership decisions

- The Electron main process owns repository path resolution, metadata watchers,
  subscription tokens, watcher recovery, and window-scoped cleanup.
- Watcher identity is worktree-aware: key ownership by the canonical worktree
  root and its resolved worktree Git directory. Linked worktrees may share a
  common Git directory, but must not be collapsed into one worktree snapshot.
- Renderer code owns the window-local `GitStatusSnapshot`. A small testable
  scheduler beside `useDesktopGitController` owns refresh ordering; React
  components do not coordinate requests themselves.
- The existing workspace watcher remains the content invalidation channel for
  Explorer and edit-review. It may also dirty the Git scheduler for working-tree
  changes, but it continues to exclude `.git/**`.
- A separate Git metadata channel dirties only repository state. It never
  refreshes Explorer and never submits paths to edit-review.
- Git commands remain the source of truth. Watcher payloads carry invalidation
  reasons, not inferred staged, branch, or commit state.
- Application-owned mutations and manual refreshes use the same generation and
  ordering rules as watcher refreshes. No direct `setGitStatus` path may allow an
  older in-flight read to overwrite a mutation result.
- Frequent status and history/graph loading are separate queries. The Changes
  surface must not pay for current-branch and all-branch history on every save.
- Integrated-terminal command detection is optional latency optimization. It is
  not a correctness dependency and must not be required for external clients.

### Subscription and event contract

Metadata subscription setup is an authorized request containing only the active
workspace root. Main resolves and owns every derived path. The renderer never
sends a Git directory, common directory, ref path, or arbitrary watch path.

The logical bridge contract is:

```text
startGitRepositoryWatch({ rootPath })
    -> { subscriptionId, rootPath, repository: true | false }

gitRepositoryInvalidated
    -> { subscriptionId, rootPath, reason }

stopGitRepositoryWatch({ subscriptionId })
    -> { ok: true }
```

`reason` is diagnostic and scheduling context such as `metadata`,
`watcher-recovered`, or `watcher-error`; it is never repository truth. The
existing workspace-content channel supplies the separate `working-tree` reason
to the same scheduler. Metadata paths remain in main-process logs and are not
needed by the renderer.

The main process creates or joins the repository watcher before resolving
`startGitRepositoryWatch`. The renderer installs its event listener, awaits the
ready subscription, and only then requests the initial snapshot. Cleanup is by
opaque `subscriptionId`, not `(webContents.id, rootPath)` alone. If a React
effect is cleaned up while start is still pending, it stops that returned token
as soon as the promise settles. An old cleanup can therefore never remove a
newer subscription.

### Refresh scheduler state machine

The scheduler is repository-scoped and framework-independent enough to unit
test with a deferred fake status reader. It tracks at least:

- active canonical workspace root
- requested and last-applied generations
- one in-flight read, if present
- dirty state accumulated during the read
- queued priority (`debounced` or `immediate`)
- last successful refresh time
- focused/visible state
- last refresh or watcher error

Its required transitions are:

```text
invalidate while idle
    -> debounce unless immediate
    -> start one read

invalidate while reading
    -> mark dirty
    -> do not start a second read

read succeeds and no newer generation exists
    -> publish snapshot
    -> record lastSuccessfulAt

read settles while dirty
    -> clear dirty
    -> run exactly one trailing read

older read settles after a newer mutation snapshot or generation
    -> discard older result

application mutation returns a snapshot
    -> advance the applied generation
    -> publish the mutation snapshot
    -> make every older in-flight read ineligible to publish

hidden or unfocused window receives background invalidation
    -> retain dirty state
    -> drain on visibility/focus restoration

manual refresh
    -> bypass debounce
    -> preserve single-flight and generation ordering
```

Loading state belongs to the active generation. Completion of an obsolete read
must not clear loading for a newer read. A transient read failure preserves the
last good snapshot, records an error, and leaves manual retry available.

Timing policy lives in named, test-injectable constants rather than scattered
timers. Initial defaults are a 250 ms refresh debounce, a 5 second maximum age
before focus reconciliation, and exponential watcher retry beginning at 250 ms
and capped at 30 seconds. Measurements may tune those values without weakening
the ordering or eventual-freshness invariants.

### Work packages

The work packages below are ordered and independently reviewable. Before writing
Package 1 production code, take two tests from Package 6 and make them fail
against the current implementation: the external edit -> observed dirty -> add
-> commit lifecycle, and the deferred-reader generation-ordering case. Then land
Packages 1 through 5 in order and complete the remaining Package 6 matrix. Later
packages may rely on contracts established by earlier ones.

#### Package 1: Repository identity and metadata watcher

Primary files:

- `local-api/workspace.mjs`
- new `electron/main/git-metadata-watch-service.mjs`
- `electron/main.mjs`

Deliverables:

- Add an internal repository resolver based on Git `rev-parse` with
  `--show-toplevel`, `--git-dir`, and `--git-common-dir`, followed by absolute
  path normalization.
- Create one reference-counted metadata watcher entry per resolved worktree
  identity. Common-directory watches may be shared internally, but invalidation
  must reach every subscribed worktree whose snapshot can be affected.
- Watch worktree-specific and common Git metadata surfaces needed for status,
  refs, upstream, config, and in-progress operations.
- Filter `index.lock`, object storage, watcher cookies, and other known feedback
  noise.
- Re-arm watches after atomic replacement, deletion/recreation, and recoverable
  watcher failure with bounded backoff.
- Clean up only the closing window's subscriptions; close shared watcher
  resources when their final token is released.

Acceptance boundary: a real temporary repository emits a Git invalidation after
external stage, unstage, commit, ref-only change, and relevant config change,
including from a linked worktree whose Git directory is outside the opened root.

#### Package 2: Authorized IPC and race-free bootstrap

Primary files:

- `electron/main/ipc/workspace-git-ipc.mjs`
- `electron/preload.cjs`
- `src/types/electron.d.ts`
- `src/features/source-control/useDesktopGitController.ts`
- `src/features/data-workspace/useWorkspaceFileWatch.ts` (compat shim; content
  watch bootstrap now lives in the Git controller readiness barrier)

Deliverables:

- Expose token-based start, invalidation, and stop operations through the
  context-isolated bridge.
- Give the existing workspace-content subscription equivalent token semantics,
  and join content and metadata readiness under one bootstrap barrier, so stale
  content-watch cleanup cannot remove a newer subscription and the initial
  snapshot cannot race ahead of either watcher.
- Authorize the workspace root before repository resolution and watcher setup.
- Move initial Git refresh behind successful subscription readiness.
- Route working-tree and metadata invalidations to the Git scheduler while
  retaining their separate Explorer/edit-review behavior.
- Make pending start and cleanup safe under React Strict Mode and rapid workspace
  switches.

Acceptance boundary: no mutation between subscription readiness and the initial
snapshot can be lost, and a stale cleanup cannot stop the active subscription.

#### Package 3: Ordered refresh scheduling

Primary files:

- new `src/features/source-control/gitRefreshScheduler.ts`
- `src/features/source-control/useDesktopGitController.ts`
- `src/App.tsx`

Deliverables:

- Centralize initial, watcher, focus, manual, configuration, and operation
  refreshes behind one scheduler.
- Enforce debounce, single-flight (physical + publishable generation), dirty
  trailing refresh, monotonic `rootEpoch` workspace isolation, and ordered
  result application.
- Prevent a status read started before stage, commit, checkout, pull, or another
  mutation from overwriting that operation's returned snapshot, without starting
  a second physical status while the prior promise is still alive.
- Preserve the last good snapshot on transient errors and retry with bounded
  exponential backoff while focused.
- Keep selection cleanup and existing view-model behavior after a new snapshot
  is accepted.

Acceptance boundary: a burst permits one active read and at most one trailing
read, and deferred fake responses prove an old generation cannot overwrite a
newer one.

#### Package 4: Fast status and lazy history

Primary files:

- `local-api/workspace.mjs`
- `electron/main/ipc/workspace-git-ipc.mjs`
- `src/lib/localFiles.ts`
- `src/features/source-control/useDesktopGitController.ts`
- History and Cloud branch-graph consumers

Deliverables:

- Split the frequent Changes snapshot from current-branch and all-branch history
  queries.
- Keep HEAD, upstream, ahead/behind, remotes, resource groups, and operation
  state required by the Source Control surface in the fast reader.
- Load history/graph lazily when its surface is active, with pagination or
  existing bounded limits and explicit HEAD/ref invalidation.
- Run background read-only status with `GIT_OPTIONAL_LOCKS=0`; do not apply that
  environment to mutating commands.
- Avoid duplicate Git queries when porcelain-v2 branch headers already provide
  equivalent information.

Acceptance boundary: a working-tree save refreshes Changes without invoking
either full history reader, while opening History still displays correct current
and all-branch data.

#### Package 5: Focus fallback, recovery, and observability

Primary files:

- `electron/main.mjs`
- `electron/main/git-metadata-watch-service.mjs`
- renderer scheduler/controller files

Deliverables:

- Queue invalidations while the window is hidden or unfocused and drain them on
  restoration.
- On focus, reconcile when the last successful snapshot is older than a bounded
  freshness threshold even if no watcher event arrived.
- Log watcher setup, invalidation reason, refresh duration, recovery attempt, and
  terminal failure with repository identity but without credentials or remote
  secrets.
- Use bounded retry/backoff and expose manual retry; never spin in a tight loop.

Acceptance boundary: a deliberately dropped watcher event is healed on stale
focus, while an unchanged hidden window does not continuously poll.

#### Package 6: Lifecycle verification

Primary files:

- new `tests/electron.git-metadata-watch.integration.test.mjs`
- new `tests/gitRefreshScheduler.test.ts`
- existing `tests/workspace.git.integration.test.mjs`
- existing Electron authorization tests

Deliverables:

- Implement the full Verification Matrix below against real temporary Git
  repositories and deterministic deferred readers.
- Use eventual predicates with timeouts for filesystem behavior; do not make
  correctness depend on fixed sleeps.
- Assert watcher/client cleanup so the test runner exits with no live handles.
- Run the full test suite and production build after targeted tests pass.

Acceptance boundary: the lifecycle tests fail against the old implementation,
pass against the new implementation, and the existing Git, authorization, and
build checks remain green.

### Prohibited shortcuts and non-goals

- Do not remove the `.git/**` exclusion from the existing shared workspace
  watcher. Git metadata needs a separate consumer and noise policy.
- Do not add unconditional interval polling or hidden-window polling as the
  primary solution.
- Do not make shell/terminal command parsing the correctness mechanism.
- Do not let the renderer nominate Git metadata paths or accept a watcher event
  as repository truth.
- Do not fix stale React rendering with forced re-renders, remount keys, or
  timers; the stale value is an old snapshot, not a component rendering defect.
- Do not run unbounded concurrent status reads or let each consumer create its
  own refresh loop.
- Do not reload full history or the branch graph on every working-tree event.
- Do not clear the last good snapshot because of a transient watcher or refresh
  error.
- Do not redesign Source Control presentation, Git hosting policy, Cloud
  authentication, or multi-window ownership as part of this change.

### Definition of Done

The target lifecycle can be relabeled **Implemented** only when all of the
following are true:

- External terminal and Git-client stage, unstage, commit, reset, fetch/ref, and
  branch operations reconcile without manual refresh or workspace reload.
- Linked worktrees, packed refs, nested branch names, and Git directories outside
  the opened folder pass real-repository tests.
- Startup and React Strict Mode cannot lose the active subscription.
- There is at most one status read in flight per active repository and at most
  one required trailing read after a burst.
- Older reads cannot overwrite mutation results or newer generations.
- Focus heals deliberately missed events within the documented freshness bound,
  without continuous hidden-window polling.
- Background status takes no optional index locks and frequent refresh does not
  load full history.
- Watcher and refresh failures preserve the last good snapshot, are observable,
  recover with bounded retry where possible, and retain manual retry.
- The Verification Matrix, complete test suite, boundary checks, TypeScript
  build, and production bundle all pass.
- This document and the Git architecture index are updated from **Proposed** to
  **Implemented** in the same change that lands the verified code; target
  invariants and rationale are retained as permanent architecture documentation.

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
