# Explorer Tree Lifecycle

This document records the lifecycle boundary for the files explorer tree:
loading folders, expanding folders, rendering bounded virtual motion, and
drawing guide lines.

For the outer Data, Git, Cloud, and Settings sidebar view stack, see
[Desktop Sidebar View Stack](desktop-sidebar-view-stack.md).

For cross-sidebar scroll area, list padding, row width, and scrollbar gutter
rules, see [Desktop Sidebar Scroll Lists](desktop-sidebar-scroll-lists.md).

## Problem

The desktop explorer sidebar lazy-loads folder children and can display the file
tree inside a sidebar column that also hosts custom surfaces for Git, Cloud, and
Settings.

Three unstable behaviors can appear if data state, view lifecycle,
virtualization, and animation presence are coupled in one component:

1. A folder's first expansion animates to a single loading row, then jumps to the
   final multi-row height after children arrive.
2. Switching from another desktop tab back to the data view replays expansion
   animations for folders that were already open.
3. Replacing recursive subtrees with a flat virtual list removes the old height
   transition entirely, or attempts to restore it by mounting/measuring the full
   subtree and loses the renderer-performance bound.

The first and third behaviors are owned by the explorer-tree lifecycle. The
second is owned by the sidebar view stack. All are architecture problems, not
animation-tuning problems. The tree cannot infer whether visible descendants
represent a fresh user expand, restored state, lazy-load completion, or virtual
row recycling if these concepts are coupled in one component.

## Design Goal

The sidebar file tree must behave as a stable controlled view:

- Folder expansion state survives tab switches.
- First-time folder loading does not animate through an intermediate loading
  height.
- User-initiated expand/collapse still animates.
- Returning to the data tab does not replay existing expansion animations.
- Expansion motion never mounts or measures the complete subtree.
- Current rows plus exit visuals never exceed the 100-row DOM budget.
- Guide segments move with their virtual row and remain visually continuous.
- File-tree rows keep symmetric visual horizontal gutters whether or not the
  native sidebar scrollbar is present.

## Final Architecture

The explorer path uses five separate concepts:

- Data loading state: which folders have children loaded and which folders are
  currently loading.
- Expansion state: which folder paths are logically expanded.
- View lifecycle: whether the files sidebar surface or a custom sidebar surface
  is currently active.
- Visible model: the complete flattened row order and path/index lookup maps.
- Motion lifecycle: a short-lived FLIP plan for only the currently mounted
  virtual rows after expansion changed.

`DataWorkspace` owns data loading and expansion state. `ExplorerTree` receives
`expandedPaths` and `loadingPaths` as controlled props and renders rows from
those props. It does not own canonical folder expansion state.

The sidebar view stack keeps the files explorer frame mounted while Git, Cloud,
or Settings sidebars are active. That outer lifecycle is documented in
[Desktop Sidebar View Stack](desktop-sidebar-view-stack.md). The tree lifecycle
assumes tab switching will not unmount the file tree subtree.

`explorerVisibleModel.ts` owns full-tree flattening. The virtual window owns the
mounted slice and hard 100-row limit. `explorerMotionPlan.ts` compares the
previous and next visible models and emits compositor-only instructions for
that slice: new rows enter, surviving rows move by their inverse index delta,
and removed rows become inert exit ghosts only when spare DOM capacity exists.
`useExplorerMotion.ts` owns plan generation, timeout cleanup, and cancellation
when the virtual window scrolls.

This keeps the UX equivalent to the common motion rule `initial={false}`:
initial/restored state is already settled; only a post-mount expansion change
animates. It does so without recreating recursive subtree DOM.

## Implementation Rules

1. Do not store canonical expansion state inside `ExplorerTree`.

   Expansion is workspace state because it must survive view switches, lazy
   loading, and active-path auto-expansion. Keep it in `DataWorkspace` and pass
   it down as `expandedPaths`.

2. Load unloaded folders before marking them expanded.

   For folders without loaded children, `DataWorkspace` must call
   `dataPort.listChildren(folderPath)` and attach the children before adding the
   folder path to `expandedFolderPaths`. This prevents motion from first
   animating a temporary loading row and then replaying for the real children.

3. Treat root loading separately from empty root state.

   The root folder has no path, so loaded/empty state must not be inferred from
   `tree.length`. Use explicit root-loaded state so an empty root can be a stable
   loaded state.

4. Keep the visible model, virtual window, and motion plan separate.

   Row rendering should not guess whether an expansion is a user action, a tab
   restore, or an initial render. The controlled expansion set produces a pure
   visible model. The virtual window chooses the mounted slice. Motion compares
   committed models only after mount and never changes canonical row state.

5. Initial or recycled rows must not animate.

   If a folder is already expanded on first render or tab return, its rows are
   settled immediately. If scrolling changes the virtual window while the full
   visible model is unchanged, cancel motion so recycled rows cannot appear to
   enter. Respect `prefers-reduced-motion` for both row and disclosure motion.

6. Animate with compositor properties and a strict row cap.

   Do not measure `scrollHeight` or animate height/top for an expanded subtree.
   Current rows use FLIP translate transforms; entering/exiting rows may also
   use opacity and a very small scale. Exit ghosts are `aria-hidden`, inert,
   pointer-free, short-lived, and admitted only while current rows plus ghosts
   stay at or below 100.

7. Keep guide geometry inside the motion shell.

   A virtual list has no mounted subtree wrapper. Each mounted row therefore
   draws the guide segments implied by its depth. The segment pseudo-elements
   belong to the inner motion shell so they translate with the row instead of
   lagging behind it. Adjacent fixed-height segments form the continuous guide.

8. Keep tab-return behavior delegated to the sidebar view stack.

   The tree should not special-case Git, Cloud, or Settings. It should receive a
   stable mounted lifecycle from the sidebar stack and focus only on controlled
   tree state.

9. Follow the shared sidebar scroll-list layout contract.

   The files explorer follows
   [Desktop Sidebar Scroll Lists](desktop-sidebar-scroll-lists.md): the scroll
   container reserves the scrollbar gutter (`scrollbar-gutter: stable`), the
   list owns horizontal padding, and rows use `width: 100%` without
   scrollbar-width compensation. In the desktop shell, the effective left and
   right content insets are both `12px`; on the right that is the reserved
   `6px` gutter plus `6px` list padding.

10. Keep root-level creation available without a root command row.

   The desktop files sidebar should not repeat the project name already shown in
   the titlebar. It also does not need a persistent root command row when that
   row competes visually with the file tree. If the project-name root row is
   hidden, the file tree should start directly with workspace children and may
   end with a trailing `+ New` row for root-level creation. Preserve the root
   row's top inset when hiding it so the first tree row does not collide with
   the titlebar boundary; the desktop default no-root top inset is `12px`.

   A trailing `+ New` row is a secondary action, not a file item. Keep it
   visually quieter than folder and file rows through subtler color, slightly
   smaller type, and lighter weight.

   Creation remains available through contextual entry points too:
   right-clicking the tree background opens root-level creation, right-clicking
   a folder opens creation under that folder, and hovered folder rows may expose
   their local create action. File rows should keep using the node action menu.

## Current Code Boundaries

- `packages/shared-ui/src/data/DataWorkspace.tsx`
  - owns `expandedFolderPaths`
  - owns `loadingFolderPaths`
  - owns root loaded state and load generation
  - loads folder children before expanding unloaded folders
  - renders the keep-alive explorer view stack

- `packages/shared-ui/src/data/ExplorerTree.tsx`
  - receives `expandedPaths` and `loadingPaths`
  - renders the controlled, virtualized tree
  - owns transient drag/drop UI state only
  - exposes root and node context-menu hooks without owning desktop menu UI
  - applies Web Animations to the bounded FLIP plan

- `packages/shared-ui/src/data/explorer/explorerVisibleModel.ts`
  - produces the complete stable row order and navigation maps

- `packages/shared-ui/src/data/explorer/explorerRowInteraction.ts`
  - derives primitive mounted-row interaction state without render-time store
    mutation; the memoized row comparator limits selection re-rendering

- `packages/shared-ui/src/data/explorer/useExplorerVirtualWindow.ts`
  - owns overscan, scroll-to-active, and the hard 100-row mounted limit

- `packages/shared-ui/src/data/explorer/explorerMotionPlan.ts`
  - computes pure enter/move/exit instructions bounded to mounted rows

- `packages/shared-ui/src/data/explorer/useExplorerMotion.ts`
  - compares committed layouts and owns plan cleanup/scroll cancellation

- `packages/shared-ui/src/styles/data-workspace.css`
  - defines virtual-row motion shells and aligned guide segments
  - defines the explorer WebKit scrollbar styling, the reserved scrollbar
    gutter, and the gutter-compensated list padding
  - preserves inactive frame layout through the sidebar view-stack styles

These files live in `packages/shared-ui` — the canonical copy in this standalone
repo (ISSUE-021). Edit them in place; there is no upstream to sync from.

## Verification

For this feature, the minimum verification is:

```bash
npm run check:shared-ui
npm run check:boundaries
npm run build
```

Manual verification should cover:

- expanding a never-loaded folder with multiple children
- expanding and collapsing an already-loaded folder
- expanding/collapsing a folder near the top of a 1,000-row tree and confirming
  the rows below move smoothly without mounting the intervening tree
- switching from Data to Git and back after several folders are expanded
- switching from Data to Cloud and Settings and back
- selecting a deep file path that auto-expands ancestor folders
- verifying guide segments remain aligned during enter, move, and exit
- verifying reduced-motion disables row and disclosure transitions
- verifying current rows plus exit ghosts never exceed 100
- verifying explorer row backgrounds keep `12px` visual left and right gutters
  inside the scrollport, and that row width stays identical between short
  (non-scrolling) and long (scrolling) trees
- verifying the scrollbar gutter stays reserved while the scrollbar thumb is
  hidden before sidebar hover
- clicking the trailing `+ New` row to create at the workspace root
- verifying the trailing `+ New` menu uses automatic placement: below the row
  when there is room, above the row near the sidebar bottom, and never clamped
  to the viewport top or bottom; horizontally, its right edge aligns to the
  trailing `+ New` row's right edge
- verifying the first tree row keeps the expected top inset when the
  project-name root row is hidden
- right-clicking tree background to create at the workspace root when the
  project-name root row is hidden
- right-clicking a folder row to create under that folder

## Invariants

These invariants should remain true after future changes:

- `ExplorerTree` is a controlled renderer for expansion state.
- Folder loading and folder expansion are separate states.
- An unloaded folder is not marked expanded until its children have been
  attached.
- The files explorer remains mounted across desktop sidebar tab switches.
- Inactive explorer frames preserve layout geometry.
- Initial/tab-restored state and scroll recycling do not animate;
  post-mount expansion/collapse does.
- Motion work and DOM presence are bounded by the virtual window; current rows
  plus exit ghosts never exceed 100.
- Expansion uses transform/opacity only and never measures a full subtree.
- Guide segments live inside the row motion shell and move with it.
- Explorer rows keep the same geometry in short and long lists. The scroll
  container reserves the scrollbar gutter; rows never compensate for scrollbar
  width in their own spacing.
- Scrollable explorer sidebars may hide the scrollbar thumb by default, then
  reveal it on hover, focus, or active scroll. Thumb visibility changes only
  `::-webkit-scrollbar-thumb` colors, never layout.
- Hiding the project-name root row must not remove root-level creation; the tree
  may expose a trailing `+ New` row, and the tree background context menu remains
  a root creation entry point.
