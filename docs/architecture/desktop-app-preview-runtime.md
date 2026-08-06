# Desktop App Preview Runtime

## Product contract

`.puppyoneapp` is a workspace-owned local application manifest. Opening one
starts its declared local server and renders that server inside the editor.
PuppyOne still has one active file rather than browser tabs:

- opening a source file replaces the visible preview but keeps the local app
  and its browser page alive for HMR and fast return;
- reopening the same app reattaches the existing page without a reload;
- opening a different app in the same workspace stops and replaces the old
  app;
- **Stop**, workspace close, window close, and application quit tear down the
  process tree and browser surface.

V1 intentionally allows at most one app runtime and one browser surface per
workspace. The internals use stable IDs and maps so a future browser-tab list
can retain multiple entries without changing the runtime/surface contracts.

## Three independent lifetimes

```text
workspace lifetime                 file/view lifetime

AppRuntimeSession ────────────────────────────────────────┐
  process group, port, health, logs                       │
                                                         │
BrowserSurfaceSession ────────────────────────────────┐   │
  isolated WebContentsView, page, cookies, history    │   │
                                                     │   │
SurfaceAttachment ───────┐        ┌───────────────────┘   │
  DOM bounds + lease ID  │ detach │ reattach              │
                         └────────┘                        │
```

The main process owns the first two layers. React owns only a short-lived
attachment lease. A React cleanup may detach its own lease, but it must never
stop a runtime or destroy a page.

Each preview activation creates a unique `attachmentId`. Bounds updates and
detach calls must carry that ID. A stale cleanup cannot hide a newer
attachment, and cleanup that arrives before asynchronous page loading finishes
is recorded and honored before the native view is attached. This is required
for React StrictMode and rapid file switching.

## Ownership and implementation

- `electron/app-preview-runtime.mjs` owns `AppRuntimeSession` records keyed by
  opaque `runtimeId`, plus a canonical-workspace index that enforces the V1
  one-app policy. It validates and hashes manifests, asks for trust, allocates
  the local port, starts a detached process group, polls health, retains
  bounded logs, and stops the whole process tree.
- `electron/main/app-preview-browser-surface.mjs` owns
  `BrowserSurfaceSession` records keyed through opaque `surfaceId` values and a
  workspace index. Detach removes the native child view without destroying its
  `WebContentsView`.
- `electron/main/app-preview-service.mjs` coordinates runtime and surface
  transitions. IPC and preload remain transport-only boundaries.
- `useAppPreviewSession` owns renderer measurement, attachment leases,
  subscriptions, and toolbar commands. `AppPreviewViewer` is presentation.

The current one-per-workspace policy lives in the workspace indexes, not in
React. Future tabs can add an ordered collection of open `runtimeId` /
`surfaceId` pairs and keep one active attachment while retaining the same
manager APIs.

## Security boundary

The manifest command is executable code and runs with the signed-in operating
system user's permissions. It is not an OS sandbox. PuppyOne therefore:

- requires explicit trust for each workspace path, manifest path, and manifest
  content hash;
- displays the exact command, working directory, declared access, and the
  user-permission warning before first run;
- requires `cwd` and the manifest file to remain inside the authorized
  workspace;
- spawns with `shell: false`, an argument array, a sanitized inherited
  environment, and forced `HOST`, `PORT`, and preview markers;
- places POSIX apps in their own process group (or uses Windows process-tree
  termination) so Stop does not leave child dev servers behind.

The embedded page uses a dedicated temporary Electron session and a
`WebContentsView` with sandboxing, context isolation, Node integration and
webviews disabled, and web security enabled. Browser permissions, downloads,
dialogs, popups, and authentication prompts are denied. Top-level navigation
and redirects must stay on the exact allocated localhost origin. The page may
load normal web subresources so real development servers, HMR, and CDN assets
continue to work.

No Electron API or preload bridge is exposed to the local app page.

## Lifecycle matrix

| User/system action | Runtime | Browser surface | Attachment |
| --- | --- | --- | --- |
| Open same `.puppyoneapp` | reuse | reuse | replace lease |
| Open source/other file | keep | keep hidden | detach |
| Return to same app | reuse | reuse page state | attach new lease |
| Open another `.puppyoneapp` | replace | replace | attach new lease |
| Preview → Source/Logs | keep | keep hidden | detach |
| Restart | replace process/port | reload/recreate safely | retain current intent |
| Stop | kill process tree | destroy | invalidate |
| Hide/minimize window | keep | hide + mute | retain |
| Close workspace/window/app | kill process tree | destroy | invalidate |

## Non-goals for V1

- no browser-tab strip or multiple simultaneous workspace apps;
- no address bar or unrestricted navigation;
- no claim that manifest permissions sandbox the spawned OS process;
- no renderer-owned process lifecycle;
- no iframe on Electron desktop (the iframe path is only a portable host
  fallback when the native surface controller is unavailable).
