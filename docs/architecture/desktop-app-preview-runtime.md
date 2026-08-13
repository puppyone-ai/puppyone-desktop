# Desktop App Preview Runtime

## Product contract

`.puppyoneapp` is a workspace-owned application manifest. Opening one starts or
reuses its declared runtime and renders that runtime as a sandboxed iframe
inside the editor.

The product has two independent lifetimes:

```text
workspace/window lifetime

AppRuntimeSession ─────────────────────────────────────────┐
  process group, port, health, logs                        │
                                                          │
EditorFrame ───────────────────────────────────────────────┘
  DOM iframe, CSS layout, browser history and page state
```

Electron Main owns `AppRuntimeSession`. React owns only the iframe element. No
native browser surface is layered over the renderer.

## Ownership

- `electron/app-preview-runtime.mjs` validates manifests, owns trust, allocates
  local ports, launches process groups, polls health, retains logs and stops
  processes.
- `electron/main/app-preview-service.mjs` serializes start/restart/stop per App
  and waits for pending mutations before window or application shutdown. It has
  no rendering responsibilities.
- The typed preload bridge exposes runtime operations only: start, restart,
  stop, logs, open externally and runtime-state subscription.
- `useAppPreviewSession` coordinates those runtime operations and rejects stale
  published generations.
- `AppPreviewViewer` renders `SandboxedAppFrame` inside the editor DOM.

There are deliberately no App Preview bounds, attachment IDs, native surface
commands or surface-state events.

## Lifecycle matrix

| User/system action | Runtime | Editor iframe |
| --- | --- | --- |
| Open same `.puppyoneapp` | reuse | keep or remount for the active editor |
| Preview → Source/Logs/Settings | keep | keep mounted and hidden |
| Return to Preview | keep | reveal the same frame and page state |
| Reload | keep | remount iframe |
| Restart | replace process/port | remount with the new runtime identity |
| Stop | stop process tree | replace with stopped state |
| Close workspace/window/app | stop process tree | DOM teardown |

## Security boundary

The manifest command is executable code and runs with the user's permissions.
PuppyOne requires explicit trust, canonicalizes `cwd`, launches without a shell
and provides a sanitized environment.

The rendered page is a separate web frame rather than a privileged Electron
renderer. It receives no preload bridge. Its sandbox and Permissions Policy
deny shell navigation, popups, downloads and sensitive browser capabilities.
The runtime URL must be credential-free HTTP(S) and must not share the PuppyOne
shell origin.

## Non-goals

- no native `WebContentsView` for App Preview;
- no geometry synchronization between React and Electron;
- no browser-tab strip or multiple visible apps;
- no claim that manifest permissions sandbox the spawned OS process;
- no unrestricted top-level navigation or Electron API inside the frame.
