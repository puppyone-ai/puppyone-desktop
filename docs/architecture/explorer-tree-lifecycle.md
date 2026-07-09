# Explorer Tree Lifecycle

This document records the lifecycle boundary for the files explorer tree:
loading folders, expanding folders, rendering subtree motion, and drawing guide
lines.

For the outer Data, Git, Cloud, and Settings sidebar view stack, see
[Desktop Sidebar View Stack](desktop-sidebar-view-stack.md).

For cross-sidebar scroll area, list padding, row width, and scrollbar gutter
rules, see [Desktop Sidebar Scroll Lists](desktop-sidebar-scroll-lists.md).

## Problem

The desktop explorer sidebar lazy-loads folder children and can display the file
tree inside a sidebar column that also hosts custom surfaces for Git, Cloud, and
Settings.

Two unstable behaviors can appear if data state, view lifecycle, and animation
presence are all coupled in one component:

1. A folder's first expansion animates to a single loading row, then jumps to the
   final multi-row height after children arrive.
2. Switching from another desktop tab back to the data view replays expansion
   animations for folders that were already open.

The first behavior is owned by the explorer-tree lifecycle. The second behavior
is owned by the sidebar view stack. Both are architecture problems, not
animation-tuning problems. The tree cannot infer whether a visible subtree is a
fresh user expand, a restored already-open subtree, or a lazy-load completion if
data state, view lifecycle, and animation presence are all coupled in one
component.

## Design Goal

The sidebar file tree must behave as a stable controlled view:

- Folder expansion state survives tab switches.
- First-time folder loading does not animate through an intermediate loading
  height.
- User-initiated expand/collapse still animates.
- Returning to the data tab does not replay existing expansion animations.
- Tree guide lines are rendered at subtree scope so each indentation level
  extends through its full child group.
- File-tree rows keep symmetric visual horizontal gutters whether or not the
  native sidebar scrollbar is present.

## Final Architecture

The explorer path uses four separate concepts:

- Data loading state: which folders have children loaded and which folders are
  currently loading.
- Expansion state: which folder paths are logically expanded.
- View lifecycle: whether the files sidebar surface or a custom sidebar surface
  is currently active.
- Motion lifecycle: whether a subtree is initially present or is transitioning
  because expansion changed after mount.

`DataWorkspace` owns data loading and expansion state. `ExplorerTree` receives
`expandedPaths` and `loadingPaths` as controlled props and renders rows from
those props. It does not own canonical folder expansion state.

The sidebar view stack keeps the files explorer frame mounted while Git, Cloud,
or Settings sidebars are active. That outer lifecycle is documented in
[Desktop Sidebar View Stack](desktop-sidebar-view-stack.md). The tree lifecycle
assumes tab switching will not unmount the file tree subtree.

Subtree animation is split into a presence layer and a motion layer:

- `ExplorerSubtreePresence` decides whether a subtree should remain mounted
  during enter/exit.
- `ExplorerSubtreeMotion` animates only transitions that occur after initial
  presence has committed.

This is equivalent to the common motion rule `initial={false}`: initial render
represents current state; subsequent state changes animate.

## Implementation Rules

1. Do not store canonical expansion state inside `ExplorerTree`.

   Expansion is workspace state because it must survive view switches, lazy
   loading, and active-path auto-expansion. Keep it in `DataWorkspace` and pass
   it down as `expandedPaths`.

2. Load unloaded folders before marking them expanded.

   For folders without loaded children, `DataWorkspace` must call
   `dataPort.listChildren(folderPath)` and attach the children before adding the
   folder path to `expandedFolderPaths`. This prevents expansion animation from
   measuring a temporary one-row loading placeholder and then stretching to the
   real content height.

3. Treat root loading separately from empty root state.

   The root folder has no path, so loaded/empty state must not be inferred from
   `tree.length`. Use explicit root-loaded state so an empty root can be a stable
   loaded state.

4. Keep presence and motion separate.

   Row rendering should not guess whether an expansion is a user action, a tab
   restore, or an initial render. Presence owns mount/exit retention; motion
   owns height measurement and animation.

5. Initial subtree presence must not animate.

   If a subtree is already expanded when it first appears in the mounted tree,
   render it at `height: auto`. Only expansion or collapse after that mounted
   presence should animate.

6. Draw indentation guides at subtree scope.

   Per-row guide lines create broken vertical guides. The guide for a level
   belongs to the subtree content wrapper so it can extend through all rendered
   descendants.

7. Keep tab-return behavior delegated to the sidebar view stack.

   The tree should not special-case Git, Cloud, or Settings. It should receive a
   stable mounted lifecycle from the sidebar stack and focus only on controlled
   tree state.

8. Follow the shared sidebar scroll-list layout contract.

   The files explorer follows
   [Desktop Sidebar Scroll Lists](desktop-sidebar-scroll-lists.md): the scroll
   container reserves the scrollbar gutter (`scrollbar-gutter: stable`), the
   list owns horizontal padding, and rows use `width: 100%` without
   scrollbar-width compensation. In the desktop shell, the effective left and
   right content insets are both `12px`; on the right that is the reserved
   `6px` gutter plus `6px` list padding.

9. Keep root-level creation available without a root command row.

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

- `vendor/shared-ui/src/data/DataWorkspace.tsx`
  - owns `expandedFolderPaths`
  - owns `loadingFolderPaths`
  - owns root loaded state and load generation
  - loads folder children before expanding unloaded folders
  - renders the keep-alive explorer view stack

- `vendor/shared-ui/src/data/ExplorerTree.tsx`
  - receives `expandedPaths` and `loadingPaths`
  - renders the controlled tree
  - owns transient drag/drop UI state only
  - exposes root and node context-menu hooks without owning desktop menu UI
  - contains subtree presence and motion helpers

- `vendor/shared-ui/src/styles/data-workspace.css`
  - defines subtree-level guide lines
  - defines the explorer WebKit scrollbar styling, the reserved scrollbar
    gutter, and the gutter-compensated list padding
  - preserves inactive frame layout through the sidebar view-stack styles

These files live in `vendor/shared-ui` — the canonical copy in this standalone
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
- switching from Data to Git and back after several folders are expanded
- switching from Data to Cloud and Settings and back
- selecting a deep file path that auto-expands ancestor folders
- verifying subtree guide lines are continuous through nested folders
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
- Initial subtree presence does not animate; post-mount expansion/collapse does.
- Tree guide lines are subtree-scoped, not row-scoped.
- Explorer rows keep the same geometry in short and long lists. The scroll
  container reserves the scrollbar gutter; rows never compensate for scrollbar
  width in their own spacing.
- Scrollable explorer sidebars may hide the scrollbar thumb by default, then
  reveal it on hover, focus, or active scroll. Thumb visibility changes only
  `::-webkit-scrollbar-thumb` colors, never layout.
- Hiding the project-name root row must not remove root-level creation; the tree
  may expose a trailing `+ New` row, and the tree background context menu remains
  a root creation entry point.
