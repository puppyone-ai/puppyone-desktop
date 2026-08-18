# App Preview architecture

App Preview turns a versioned `.puppyoneapp` manifest into a web application
embedded inside the editor. The manifest is a project file, not an executable
file: Electron validates it, asks for trust, starts the declared runtime and
returns the validated URL to the renderer.

## Boundaries

The implementation has four layers:

1. `shared/appPreviewManifest.js` is the single manifest contract. Both the
   renderer and Electron main process use the same strict parser.
2. `electron/app-preview-runtime.mjs` owns processes, ports, health checks,
   logs, trust and shutdown. A runtime is keyed by canonical workspace root
   plus manifest path.
3. `electron/main/app-preview-service.mjs` serializes runtime mutations for an
   App and drains pending work before window/application shutdown. It owns no
   browser surface.
4. `AppPreviewViewer` owns presentation and renders the validated runtime URL
   in a sandboxed iframe that is a real child of the editor DOM.

The split is intentional: Electron owns privileged process lifecycle; the DOM
owns layout. App Preview has no native view, geometry IPC, attachment lease or
parallel z-order tree.

## Layout invariant

The iframe is the preview surface. It fills `.app-preview-surface-host`, which
is inside the editor's normal Flex/Grid tree. Sidebar collapse, pane dragging,
auxiliary panels, window resizing, clipping and product overlays therefore use
ordinary browser layout and never require translated `x/y/width/height` bounds.

Source, Logs and Settings hide the mounted preview surface instead of replacing
it. Returning to Preview preserves in-page state without moving the page into a
window-level native layer.

## Runtime lifecycle

Opening a configured manifest performs this sequence:

1. Parse and validate the manifest.
2. Resolve `cwd` canonically inside the authorized workspace.
3. Compute the trust fingerprint and show the native confirmation dialog when
   necessary.
4. Start or reuse the runtime and wait for its health check.
5. Return the validated HTTP(S) URL and mount it in the editor iframe.

Stop, workspace close, window close and application quit are serialized behind
any pending start/restart and then tear down the runtime process tree. React
never owns or kills child processes directly.

## Embed security

- The runtime URL is validated by the main process and checked again before it
  reaches `iframe.src`; only credential-free HTTP(S) URLs are accepted.
- A URL sharing the PuppyOne shell origin is rejected. This is required because
  real app frameworks need both `allow-scripts` and `allow-same-origin`.
- The iframe receives no Electron preload or privileged bridge.
- The sandbox grants scripts, same-origin runtime behavior and forms, but not
  top navigation, popups, modal dialogs or downloads.
- Permissions Policy explicitly denies camera, microphone, geolocation,
  display capture, MIDI, payment, USB, serial and clipboard capabilities.
- `referrerPolicy="no-referrer"` prevents the shell URL from being disclosed.
- The desktop shell's CSP limits framing to allowed web protocols.

The manifest command itself still runs with the signed-in operating-system
user's permissions after explicit trust. The iframe boundary limits web-page
access to the PuppyOne renderer; it is not an OS sandbox for the command.

## Manifest example

```json
{
  "type": "puppyone.app",
  "version": 1,
  "name": "Pitch deck",
  "launch": {
    "kind": "local-server",
    "command": ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "${port}"],
    "cwd": ".",
    "url": "http://127.0.0.1:${port}/",
    "health": { "path": "/", "expectStatus": 200 }
  },
  "permissions": { "workspace": ["read"] }
}
```
