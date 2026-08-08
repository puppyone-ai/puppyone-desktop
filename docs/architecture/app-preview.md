# App Preview architecture

App Preview turns a versioned `.puppyoneapp` manifest into a localhost web app
inside the editor. The manifest is a project file, not an executable file: the
main process validates it, asks for trust, starts the declared development
server, and owns the browser surface.

## Boundaries

The implementation is split into four layers:

1. `shared/appPreviewManifest.js` is the single manifest contract. Both the
   renderer and Electron main process use the same strict parser. Version 1
   supports `local-server` launches and the `${port}` variable only.
2. `electron/app-preview-runtime.mjs` owns processes, ports, health checks,
   logs, trust, and shutdown. A runtime is keyed by canonical workspace root
   plus manifest path, so multiple previews can run in one workspace.
3. `electron/main/app-preview-browser-surface.mjs` owns sandboxed
   `WebContentsView` instances. Each app gets an ephemeral session per window;
   only the active editor surface is attached to the window.
4. `electron/main/app-preview-service.mjs` coordinates short-lived renderer
   attachment leases with longer-lived runtimes and browser surfaces. React
   components never own or kill child processes directly.

Renderer-to-main calls go through the typed preload bridge and narrow IPC
handlers. The renderer receives opaque runtime and surface IDs and cannot
create a browser with arbitrary Electron preferences.

## Lifecycle

Opening a manifest performs this sequence:

1. Parse and validate the manifest.
2. Resolve `cwd` canonically inside the authorized workspace.
3. Compute the trust fingerprint and show the native confirmation dialog when
   necessary.
4. Allocate a localhost port, interpolate command arguments and environment,
   spawn without a shell, and wait for the health check.
5. Create or reuse the app's native browser surface and attach it to the active
   editor bounds.

Switching files detaches the view but keeps its page and process warm. If no
renderer attachment returns within 60 seconds, the service stops that app and
destroys its surface. Closing a window releases all leases owned by that
window; application shutdown stops every process.

## Trust and security

- Commands are arrays and always run with `shell: false`.
- `cwd` must remain inside the authorized workspace, including after symlink
  resolution.
- The trust fingerprint includes the manifest and, for npm/pnpm/yarn/bun
  commands, the selected `package.json` script. Editing the actual script
  therefore requires fresh confirmation even if the manifest did not change.
- The child receives a small development-tool environment allowlist instead of
  the full desktop process environment.
- Browser surfaces use temporary partitions, sandboxing, context isolation,
  disabled Node integration, denied permissions/downloads/popups, and exact
  localhost-origin navigation.
- Remote URLs are intentionally outside the version 1 contract. They require a
  separate threat model and must not be added as a manifest shortcut.

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

When a framework uses different CLI flags, edit `command` to match that
framework. The allocated port can also be read from the injected `PORT`
environment variable.
