# Desktop Minimal Mode

Minimal Mode is an experimental presentation mode for an open PuppyOne
workspace. It removes persistent application chrome without creating a second
workspace, editor, Git controller, Terminal, or Agent session.

## Product contract

When `Settings → Experimental → Minimal Mode` is enabled:

- the normal application titlebar is not rendered;
- the workspace body occupies the titlebar's former height;
- the Files sidebar remains available, but its persistent top, left, or bottom
  navigation controls are omitted;
- a small PuppyOne logo remains centered at the top of the window;
- hovering, focusing, or clicking that logo reveals one horizontal command
  dock;
- project switching, branch checkout, workspace views, Settings, external
  open, Terminal, Chat, updates, and exiting Minimal Mode remain reachable from
  that dock;
- Agent Chat keeps its transcript and composer, while configured Provider and
  Model labels and the session sub-header are hidden. Provider and Model
  controls remain visible when configuration is incomplete so Chat cannot
  become unusable.

The native macOS traffic lights remain owned by Electron. The Files sidebar
reserves a small top safe area for those controls, while the editor continues
behind the floating dock.

## State ownership

`ExperimentalSettings.enableMinimalMode` is the only persisted mode flag. The
flag changes composition, not application state:

```text
App
 ├─ normal mode  → DesktopCloudShell titlebar + sidebar navigation
 └─ minimal mode → DesktopMinimalModeDock + full-height workspace body

Both branches reuse:
  workspace lifecycle
  active DesktopView
  project and branch switcher state
  Git controller
  right-sidebar open/surface/width state
  Terminal process lifecycle
  Agent session controller and projection
```

Switching modes must not change `activeView`, the active file, expanded Files
folders, right-sidebar width, the active Terminal surface, or the Agent turn.

## Component boundaries

- `src/preferences.ts` owns parsing and the off-by-default experiment value.
- `src/features/settings/SettingsView.tsx` owns the opt-in switch.
- `src/components/DesktopCloudShell.tsx` selects normal or minimal chrome.
- `src/features/app-shell/DesktopMinimalModeDock.tsx` owns only horizontal dock
  composition and its temporary expanded/pinned state.
- `src/features/app-shell/DesktopWorkspaceContent.tsx` omits persistent sidebar
  navigation slots and exposes the traffic-light safe-area hook.
- `src/features/desktop-agent/ui/RightAgentPanel.tsx` removes session chrome in
  Minimal Mode without changing the controller lifecycle.
- `src/features/desktop-agent/ui/AgentComposer.tsx` hides already-configured
  Provider/Model labels while preserving recovery controls when routing is not
  ready.

## Interaction and accessibility

- The logo is a real button named `Minimal Mode controls`.
- Click pins or unpins the horizontal dock; `Escape` unpins it.
- Hover and `:focus-within` also reveal the dock.
- Every icon has an accessible name and native tooltip.
- Active workspace views expose `aria-current="page"`.
- Existing project, branch, external-open, Terminal, and Chat controls retain
  their original menus, pressed state, and labels.
- `Exit Minimal Mode` is always present in the expanded dock, so hiding the
  Settings navigation cannot trap the user in the mode.

## Invariants

- Do not duplicate project switching or checkout logic in the dock.
- Do not unmount the right-sidebar stack merely because chrome changes.
- Do not reset editor or Agent state when the experiment changes.
- Do not hide Provider/Model selection when Chat has no valid route.
- Do not remove a normal-mode command without providing it through the dock.
- Keep the dock horizontal; project and branch menus may still open vertically
  because they contain variable-length lists.
