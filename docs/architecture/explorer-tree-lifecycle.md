# Explorer Tree Lifecycle

This document records the lifecycle boundary for the files explorer tree:
loading folders, expanding folders, rendering subtree motion, and drawing guide
lines.

For the outer Data, Git, Cloud, and Settings sidebar view stack, see
[Desktop Sidebar View Stack](desktop-sidebar-view-stack.md).

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
  - contains subtree presence and motion helpers

- `vendor/shared-ui/src/styles/data-workspace.css`
  - defines subtree-level guide lines
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
