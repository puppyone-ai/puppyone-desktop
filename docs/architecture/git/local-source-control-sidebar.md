# Local Source Control Sidebar

Architecture home: [Git and Source Control Architecture](README.md).

**Status:** Implemented. Repository freshness after external Git operations is
owned by
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

Working-file detail is format-aware. Main derives an authorized immutable
before/after pair for the selected scope, then the renderer's ordered Diff
Registry chooses unified text, DOCX semantic redline, or the total metadata
fallback through canonical format resolution. The complete authority, resource
handle, cancellation, worker, cache, and extension contracts live in
[Format-Aware Diff Pipeline](format-aware-diff-pipeline.md).

The long-term refresh architecture separates frequent working-tree status from
history pagination. See
[Repository Status Refresh Lifecycle](status-refresh-lifecycle.md); history must
not be reloaded in full after every filesystem event.

### Working-file presentation contract

The Changes detail is a developer-tool surface, not a dashboard or marketing
card. The selected path is compact context text rather than a page headline;
file actions use low-emphasis toolbar controls, with destructive color becoming
prominent on interaction instead of through a persistent tinted button.

For a single selected file, the detail header owns path, status, statistics,
and actions. The diff block omits its duplicate file header. Multi-file commit
and history diffs retain per-file headers because those labels disambiguate the
blocks. The code surface stays one tonal step above the deepest inset so it
does not become a black slab. Diff rows use soft full-line backgrounds and
gently tinted muted foregrounds; color is a change signal, not the primary
reading color. Raw unified-diff hunk coordinates such as `@@ -67,12 +68,11 @@`
remain in the data model but are not rendered as user-facing copy. File status,
file-level addition/deletion totals, line numbers, and a quiet separator carry
the useful context without exposing patch syntax.

Text Changes detail is a fixed unified three-column review: one relevant line
number, one always-visible `+/-` marker, and the content. Removed rows show the
old-file line number; added and context rows show the new-file line number.
The original old/new coordinates remain attached to the row as data, but the
reader does not pay for two permanent number gutters. This surface does not use
split view by default: the persistent sidebar and prose-heavy files would make
two narrow editors wrap more aggressively than a single unified stream.

Keep these responsibilities separate:

- the detail header owns selection context and file-level actions;
- the diff container owns file boundaries and hunk structure;
- diff rows own line-level add/remove signals;
- the Source Control sidebar owns bulk and section-level operations.

Local, non-deleted working-file details expose `Open file` as the first header
action. It selects the path and navigates to Data without introducing a second
file route. Mutating actions follow it in safe-to-destructive order: `Stage`
before `Discard`, with `Discard` at the far right. Staged files use
`Open file` then `Unstage`.

Source Control uses one compact action-control contract across its sidebar and
detail surfaces: operation buttons are `24px` high with `12px` labels, `7px`
inline padding, and a `5px` radius. This applies to Commit, Pull, Push,
Download, Publish, Stage, Unstage, Discard, Open file, and equivalent Git
actions. The surrounding sidebar rows remain `30px` high; action density must
not shrink row hit areas or body typography.

Only one available workflow action receives solid primary emphasis at a time.
The priority is staged Commit, incoming Pull or Download, outgoing Push or
Publish, then the simple-mode combined Stage & Commit action. Other available
operations remain ghost controls; unavailable operations stay muted. This is a
state-machine decision expressed by the `is-primary` class, not a label-based
CSS exception.

The sidebar uses a deliberately quiet type hierarchy: primary row content is
`13px`, metadata is `12px`, ordinary content uses the global regular weight,
and section or selected-row emphasis uses the global medium weight. File-type
glyphs are neutral in the Git list; change letters retain semantic color.
Persistent secondary and destructive detail actions remain ghost controls and
only gain a surface on interaction. Diff add/remove fills stay low-chroma so
large changed blocks do not compete with their text.

## Current Refresh Boundary

The controller performs an initial status read after the Git metadata
subscription is ready. It also accepts refreshes from working-tree content
events, Git metadata events, explicit product actions, configuration changes,
focus reconciliation, and Git operation results.

Working-tree and Git-metadata invalidations are separate channels. Frequent
status reads stay lightweight; History and Cloud branch graphs load commit
history lazily. See
[Repository Status Refresh Lifecycle](status-refresh-lifecycle.md).

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
  - authorized Git IPC handlers, cancellable diff requests, and revision reads
- `electron/main/git-diff-resource-broker.mjs`
  - audience/session/revision-bound, bounded, revocable rich-diff resources
- `local-api/workspace.mjs`
  - Git execution, parsing, snapshots, trusted revision pairs, history, and mutations
- `src/features/source-control/diff/core/`
  - ordered registry, generic async lifecycle, and weighted TTL cache primitive
- `src/features/source-control/diff/contributions/`
  - vertical text, DOCX, and metadata comparison capabilities

## Verification

Existing real-repository tests cover repository detection, stage/commit,
working-tree status, all revision-pair scopes, remote divergence, diffs,
branches, and remote configuration in
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
- Working-file actions remain compact, low-emphasis controls; the view must not
  promote every file operation into a persistent CTA.
- A single-file Changes detail does not repeat the same path and status in a
  second diff header.
- Working-file header actions place navigation first and destructive mutation
  last; `Discard` must remain to the right of `Stage`.
- Source Control operation buttons share the `24px` action-size contract; do
  not reintroduce feature-local `28px` or `30px` operation controls.
- Source Control metadata must remain one typography step below primary row
  content; do not map `--git-font-small` back to the sidebar body size.
- File glyph color, persistent button fills, and diff fills must not all act as
  simultaneous emphasis channels; reserve semantic color for change state.
- At most one Source Control workflow operation may carry `is-primary`; keep
  regular Stage and Unstage actions ghosted and Discard semantically red.
- Do not expose raw unified-diff hunk coordinates in the detail UI. Preserve
  them in the model for patch semantics, but use file totals and line numbers
  for the visible reading context.
- Text Git Changes always uses the unified `line / +/- / content` structure.
  Rich binary formats resolve through the Diff Registry; do not restore two
  visible line-number gutters, hide Git's structural symbols, or put extension
  conditionals back into `GitStatusView`.
