# Desktop Multi-Window Workspaces

PuppyOne Desktop supports multiple workspace windows with the same ownership
model as VS Code: one app instance, many windows, and one active repo per
window.

Repository metadata invalidation and focus reconciliation are documented in
[Repository Status Refresh Lifecycle](git/status-refresh-lifecycle.md).

## Requirement

The app must allow users to work in several repos at the same time without
putting several repos into one renderer state tree.

Two invariants define the model:

- One repo can be open in at most one PuppyOne window at a time.
- One PuppyOne window can own at most one active repo at a time.

Opening a repo that is already open must focus the existing window instead of
creating a duplicate window.

## Final Architecture

The Electron main process owns cross-window state:

- `windowsById`: maps `webContents.id` to each `BrowserWindow`.
- `windowStateById`: stores each window's initial workspace path, active
  workspace path, and last focused time.
- `workspaceWindowByPath`: maps a canonical workspace path to the owning
  window.

Renderer state remains window-local. Each `BrowserWindow` gets a separate React
tree, so editor selection, preview cache, Git state, Cloud route state, sidebar
state, and terminal UI state do not need to become multi-workspace stores.

Workspace identity uses canonical filesystem paths from `realpath` where
possible. User-provided paths are resolved before they are compared, so a repo
opened through a symlink cannot accidentally create a duplicate window for the
same underlying folder.

## Product Behavior

- App startup restores the last active workspace in the first window.
- A new window receives an initial workspace path from main and asks
  `window:get-initial-workspace` during renderer startup.
- `Open local folder` opens the selected repo in the current window unless that
  repo already has a window, in which case the existing window is focused.
- `Open folder in new window` creates a new window only when the selected repo
  is not already open.
- Recent workspaces are app-level state, not renderer-local state.
- Window titles include the workspace name.
- Closing a repo window does not close terminals, watchers, or state owned by
  other repo windows.

## Main-Process Responsibilities

Main owns the app-level invariant that a repo cannot be opened twice. Renderer
code must not guess whether another window already owns a workspace.

All workspace-opening paths must route through main-process commands:

- `window:get-initial-workspace`
- `workspace:open-current`
- `workspace:open-new-window`
- `workspace:select-folder-current`
- `workspace:select-folder-new-window`

Each command either assigns the workspace to the requesting window, creates a new
window, or focuses the existing owning window.

## Renderer Responsibilities

Renderer owns only the current window's state:

- active workspace object
- active file path
- editor and preview state
- Git view state
- Cloud route state
- sidebar state

Renderer should treat `focused-existing` workspace-open results as a completed
action for another window, not as a signal to change the current window's active
workspace.

## Resource Cleanup

Window close cleanup is scoped by `webContents.id`:

- close terminal sessions for that window
- unsubscribe that window from workspace watchers
- close a workspace watcher only when it has no remaining clients
- release that window's workspace ownership

App quit may still close all terminal sessions and all watchers.

## Invariants

- `workspaceWindowByPath` is the source of truth for duplicate-window
  prevention.
- Renderer state is not shared across workspace windows.
- Recent workspace storage is app-level state.
- Dialog ownership comes from `BrowserWindow.fromWebContents(event.sender)`.
- No IPC handler should use a global `mainWindow`.
- Closing one window must not tear down resources owned by another window.
