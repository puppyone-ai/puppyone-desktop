# Desktop Sidebar View Stack

This document records the lifecycle boundary for the desktop sidebar column. It
focuses on how the Data, Git, Cloud, and Settings sidebar surfaces coexist
without destroying the files explorer view.

For file-tree loading, expansion, subtree animation, and guide-line behavior,
see [Explorer Tree Lifecycle](explorer-tree-lifecycle.md).

## Problem

The desktop explorer sidebar can display multiple view modes in the same column:
the file tree for the data view, and custom sidebar surfaces for Git, Cloud, and
Settings.

Two unstable behaviors can appear if view lifecycle, data loading, expansion,
and animation presence are all coupled in one component:

1. A folder's first expansion animates to a single loading row, then jumps to the
   final multi-row height after children arrive.
2. Switching from another desktop tab back to the data view replays expansion
   animations for folders that were already open.

The first behavior is owned by the explorer-tree lifecycle. The second behavior
is owned by the sidebar view stack. Both are architecture problems, not
animation-tuning problems.

## Design Goal

The sidebar column must behave as a stable controlled view stack:

- Folder expansion state survives tab switches.
- Returning to the data tab does not replay existing expansion animations.
- Git, Cloud, and Settings may replace the visible sidebar content without
  destroying the files explorer subtree.
- Hidden sidebar frames preserve layout geometry so measured explorer heights
  remain valid.
- Hidden sidebar frames do not receive pointer interaction.

## Final Architecture

The full explorer/sidebar path uses four separate concepts:

- Data loading state: which folders have children loaded and which folders are
  currently loading.
- Expansion state: which folder paths are logically expanded.
- View lifecycle: whether the files sidebar surface or a custom sidebar surface
  is currently active.
- Motion lifecycle: whether a subtree is initially present or is transitioning
  because expansion changed after mount.

This document owns the view lifecycle boundary. The sidebar column uses a
keep-alive view stack. The files explorer frame remains mounted while Git,
Cloud, or Settings sidebars are active. Inactive frames are hidden with
`visibility: hidden` and `pointer-events: none`, not unmounted and not
`display: none`.

This preserves layout measurements and avoids treating tab return as a fresh
tree mount. `DataWorkspace` still owns data loading and expansion state, and
`ExplorerTree` still renders the controlled tree from those props.

## Implementation Rules

1. Keep the files explorer view mounted across sidebar tab switches.

   Git, Cloud, and Settings may replace the visible sidebar content, but they
   must not destroy the files tree subtree. Use the view stack contract instead
   of conditional rendering that swaps the tree out.

2. Do not use `display: none` for inactive explorer frames.

   `display: none` removes layout and invalidates measured heights. Hidden
   frames should retain geometry with `visibility: hidden` plus disabled pointer
   events.

3. Keep tab switching separate from expansion state.

   A tab switch is a view lifecycle change, not a folder expansion or collapse.
   It must not rewrite `expandedFolderPaths`, reset `loadingFolderPaths`, or
   cause `ExplorerTree` to infer that already-open subtrees are newly entered.

4. Route custom sidebar surfaces through the same stack.

   Data, Git, Cloud, and Settings sidebar content should share one sidebar-frame
   contract. Adding a new sidebar surface should not require changing explorer
   expansion or motion semantics.

5. Preserve pointer and focus behavior for hidden frames.

   Hidden frames keep layout, but they must not be interactive. Disable pointer
   events and keep focus navigation on the active sidebar surface.

## Current Code Boundaries

- `frontend/shared-ui/src/data/DataWorkspace.tsx`
  - renders the keep-alive explorer view stack
  - owns `expandedFolderPaths`, `loadingFolderPaths`, root loaded state, and
    load generation for the file tree
  - passes controlled tree state into `ExplorerTree`

- `frontend/shared-ui/src/data/ExplorerTree.tsx`
  - must not infer fresh expansion from tab return
  - receives controlled expansion and loading props from `DataWorkspace`

- `frontend/shared-ui/src/styles/data-workspace.css`
  - defines the keep-alive explorer frame stack
  - preserves inactive frame layout without pointer interaction

The desktop app consumes these shared UI files through
`desktop/vendor/shared-ui`. After changing shared UI, run:

```bash
node scripts/sync-desktop-shared-ui.mjs
```

## Verification

For this feature, the minimum verification is:

```bash
cd desktop
npm run check:shared-ui
npm run check:boundaries
npm run build
```

Manual verification should cover:

- expanding several folders, then switching from Data to Git and back
- switching from Data to Cloud and Settings and back
- verifying already-open folders stay open after tab switches
- verifying existing folder expansion animations do not replay after tab return
- verifying hidden sidebar frames preserve layout but do not receive pointer
  interaction

## Invariants

These invariants should remain true after future changes:

- The files explorer remains mounted across desktop sidebar tab switches.
- Inactive explorer frames preserve layout geometry.
- Inactive explorer frames do not accept pointer interaction.
- Switching sidebar tabs is not a folder expansion or collapse event.
- Returning to the data tab must not be treated as a fresh tree mount.
- Custom sidebar surfaces use the view stack contract instead of conditionally
  unmounting the files explorer subtree.
