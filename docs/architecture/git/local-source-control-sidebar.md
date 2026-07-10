# Local Source Control Sidebar

Architecture home: [Git and Source Control Architecture](README.md).

**Status:** Implemented. Repository freshness after external Git operations has
a known gap documented in
[Repository Status Refresh Lifecycle](status-refresh-lifecycle.md).

## Purpose

This document owns the local Git Source Control experience in PuppyOne Desktop:

- the renderer state that backs the Git navigation badge, sidebar, and main view
- the mapping from a raw `GitStatusSnapshot` to product-facing resource groups
- stage, unstage, discard, commit, pull, push, publish, and branch actions
- commit and working-file detail selection
- the renderer/preload/IPC/local-API boundary

It does not own shared sidebar mounting or CSS geometry. Those contracts remain
in [Desktop Sidebar View Stack](../desktop-sidebar-view-stack.md) and
[Desktop Sidebar Scroll Lists](../desktop-sidebar-scroll-lists.md).

## End-to-End Data Flow

```text
GitSidebar / GitStatusView / navigation badge
                    |
                    v
       useDesktopGitController
                    |
                    v
          src/lib/localFiles.ts
                    |
                    v
           electron/preload.cjs
                    |
                    v
  workspace-git-ipc.mjs + root authorization
                    |
                    v
         local-api/workspace.mjs
                    |
                    v
                 Git CLI
```

The renderer never executes Git directly. `getWorkspaceGitStatus` invokes the
context-isolated desktop bridge, the main process authorizes the requested root
against the workspace assigned to the calling window, and the local API runs Git
with argument arrays rather than shell interpolation.

The local API currently constructs a `GitStatusSnapshot` from Git branch, HEAD,
status, ref, remote, synchronization, and history data. The snapshot is returned
through IPC and committed to renderer state as one object.

## Renderer State Ownership

`src/features/source-control/useDesktopGitController.ts` owns the window-local
Git state:

- the last `GitStatusSnapshot` and the workspace path it belongs to
- status loading and error state
- the active Changes or History panel
- selected working file and selected commit
- working-file diff and commit-detail requests
- active Git operation and operation errors
- branch-switch confirmation state

`activeGitStatus` is exposed only when the stored snapshot path matches the
current workspace path. This prevents a completed request for a previous
workspace from being displayed after navigation.

The controller clears snapshot, selection, detail, and operation state when the
workspace path changes. Detail requests are active only while the Git view is
active and their corresponding selection still exists.

## Snapshot and View-Model Boundary

The raw snapshot contains both low-level status collections and a
`sourceControl` product model:

- `entries`: parsed Git status entries
- `stagedEntries`: index changes
- `unstagedEntries`: tracked working-tree changes
- `untrackedEntries`: untracked working-tree files
- `branches`, `remotes`, `syncTarget`, and current HEAD data
- `sourceControl.groups`: merge, index, working-tree, and untracked resources
- `sourceControl.remote`: ahead/behind state and incoming/outgoing previews

`src/features/source-control/viewModel.ts` is the durable derivation boundary.
It converts the snapshot into sidebar sections, action labels, enabled states,
hosting mode, and simple/professional presentation. React components should not
reimplement those decisions.

`SourceControlSidebar.tsx` composes the visible sidebar from that model. It owns
expansion and resize presentation state, but it does not own Git truth.

## Sidebar Composition

Depending on repository and hosting state, the sidebar can render:

- hosting identity or PuppyOne Cloud provider state
- incoming or remote synchronization state
- merge/conflict resources
- committed-but-not-pushed resources
- staged/index resources and commit actions
- unstaged and untracked working-tree resources
- a History shortcut backed by the current snapshot

Simple mode may combine staged and working resources into one product-facing
change flow. Professional mode keeps index and working-tree resources separate.
Both modes must derive from the same snapshot and view model.

The navigation badge and titlebar branch indicator also consume the active
snapshot. A stale snapshot therefore affects more than the visible Git sidebar.

## Operation Lifecycle

Application-initiated Git mutations route through controller handlers and the
same authorized IPC boundary as status reads.

Most operations follow this contract:

1. Set an operation key and clear the previous operation error.
2. Execute the main-process/local-API Git operation.
3. Receive a new `GitStatusSnapshot` from the operation.
4. Replace renderer Git state with that snapshot.
5. Refresh workspace content when the operation may affect files.
6. Clear invalid selections after commit, discard, or branch changes.
7. Settle the operation loading state.

Commit, checkout, stash-and-checkout, and commit-and-checkout additionally reset
the main panel or selection where the previous resource identity is no longer
valid.

An application mutation must not depend solely on a filesystem watcher to learn
its result. The operation response or a guaranteed post-operation reconcile is
the authoritative completion path.

## Diff and History Detail

Working-file selection maps to one of these scopes:

- `unstaged`
- `untracked`
- `staged`
- `committed`
- `remote`

The controller requests the corresponding diff only while the selection is
active. Commit selection similarly requests commit detail by commit id.

The long-term refresh architecture separates frequent working-tree status from
history pagination. See
[Repository Status Refresh Lifecycle](status-refresh-lifecycle.md); history must
not be reloaded in full after every filesystem event.

## Current Refresh Boundary

The controller performs an initial status read when the local workspace becomes
active. It also accepts refreshes from workspace file events, explicit product
actions, configuration changes, and Git operation results.

The current workspace watcher excludes all `.git/**` events while the renderer
uses that watcher as its external-change refresh signal. External `git add`,
`git commit`, ref-only updates, and similar commands can therefore leave this
implemented sidebar displaying an old snapshot.

That defect and its proposed replacement are owned only by
[Repository Status Refresh Lifecycle](status-refresh-lifecycle.md). This
document describes how the sidebar consumes a snapshot, not how repository
freshness is detected.

## Current Code Boundaries

- `src/App.tsx`
  - creates the controller and connects workspace file-watch refreshes
- `src/features/source-control/useDesktopGitController.ts`
  - owns renderer status, selection, detail, and operation state
- `src/features/source-control/viewModel.ts`
  - derives product-facing sections and actions
- `src/features/source-control/SourceControlSidebar.tsx`
  - composes the sidebar surface
- `src/features/source-control/GitStatusView.tsx`
  - renders overview, history, commit detail, and working-file detail
- `src/features/app-shell/navigation.tsx`
  - derives Git navigation badges from the active snapshot
- `src/lib/localFiles.ts`
  - renderer-side typed Git bridge
- `electron/preload.cjs`
  - context-isolated IPC exposure
- `electron/main/ipc/workspace-git-ipc.mjs`
  - authorized Git IPC handlers
- `local-api/workspace.mjs`
  - Git execution, parsing, snapshots, diffs, history, and mutations

## Verification

Existing real-repository tests cover repository detection, stage/commit,
working-tree status, diffs, branches, and remote configuration in
`tests/workspace.git.integration.test.mjs`. IPC authorization coverage lives in
`tests/electron.workspace-authorization.test.mjs`.

Those tests validate explicit reads and operations. External-command freshness,
watcher recovery, and refresh ordering belong to the lifecycle test matrix in
[Repository Status Refresh Lifecycle](status-refresh-lifecycle.md).

## Invariants

- A displayed snapshot always belongs to the active workspace path.
- Git truth comes from a fresh Git query, never directly from a watcher payload.
- View-model rules live outside presentational components.
- Renderer code does not execute shell commands or grant itself workspace
  authority.
- Application-initiated mutations reconcile status as part of operation
  completion.
- Selection is cleared when its file or commit no longer exists in the active
  snapshot.
- Shared sidebar lifecycle and layout rules are not duplicated in this feature
  document.
