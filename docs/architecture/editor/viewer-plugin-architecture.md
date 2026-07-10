# Viewer Plugin Architecture

**Status: Stage B0 host foundations + Stage B1 first-party local pack path
landed in code and tests. Stage C (third-party marketplace) is not open.
Production Apple signing/notarization for distributed `.puppyplugin`
artifacts remains release-gated where certificates are unavailable.**

This document is the target architecture for sandboxed Viewer Packs — a
local plugin marketplace for file formats the core app will not absorb
(3D, CAD, vertical binaries). Built-in Tier-1 editors stay in-process;
plugin-eligible surfaces are placeholder-grade formats only.

## 1. Problem

File formats are unbounded. The core ships universal knowledge-work
viewers. Vertical formats must install as signed, sandboxed packs without
growing the base installer or trusting third-party code in the app
renderer.

## 2. Built-in / plugin boundary

> Would an ordinary user accept "install a plugin first" the first time
> they open this file type?

- **Built-in:** text, Markdown, code, JSON, CSV, images, PDF, audio/video,
  HTML, Office.
- **Plugin:** 3D / game assets / CAD / scientific / proprietary.
- **Escape hatch:** external-open remains available for every format.

## 3. Target architecture (Stage B)

```text
.puppyplugin (signed zip)
├── manifest.json
└── dist/viewer.html (+ assets)

main process (sole authority)
├── store <userData>/viewer-packs/
├── package service (verify → extract → atomic enable)
├── registry (immutable contribution snapshot)
├── router (core vs plugin vs chooser vs unsupported)
├── resource broker (audience-bound handles + bounded Range)
├── session manager (WebContentsView + temp partition)
├── puppyone-plugin://  (pack assets only)
└── puppyone-resource:// (session-scoped Range)

shared-ui
├── coreViewerCapability / resolveViewerRoute (pure)
└── ExternalViewerAdapter (DI surface slot — no Electron)

desktop shell
├── PluginSurfaceController (activate / bounds / destroy via app IPC)
└── local install CTA (catalog disabled by default)

plugin frame
└── window.puppyoneViewer only (fixed plugin-preload)
```

## 4. Non-negotiable practices

1. Main process is the sole authority for packages, grants, sessions, and
   resource handles.
2. shared-ui never imports Electron and never scans the pack store.
3. Plugin code never runs in the app renderer, main process, or app
   preload.
4. Fixed `electron/plugin-preload.cjs` exposes only
   `window.puppyoneViewer` — never `puppyoneDesktop`.
5. Cloud / unknown document sources fail closed before plugin activation.
6. Possession of a path is never authority; handles are audience-bound.
7. Catalog transport is disabled by default; opening a file never hits
   the network.
8. Production packages execute only from the immutable version directory
   under `<userData>/viewer-packs/packages/<id>/<version>/`.
9. App IPC (install/activate/bounds) uses `trustedIpcMain`. Plugin bridge
   IPC uses raw `ipcMain` with sender → session validation.

## 5. Routing (§5.1)

1. If core capability is `edit` or `preview` → core owns the document.
2. If capability is `placeholder` and source is not `local` →
   `unsupported` (`cloud-source`).
3. Else match enabled contributions by extension / MIME.
4. Zero matches → `unsupported` (`no-match`) → Desktop shows local
   install CTA.
5. One match → `plugin`.
6. Multiple → `chooser`.

## 6. Host API v1

Delivered to the pack frame as `window.puppyoneViewer`:

- `document.getMeta()`
- `resource.open()` / `readRange()` / `createRangeUrl()` / `close()`
- `ui.setState()` / `getTheme()` / `onThemeChange()`
- `host.openExternal()`

Anything else is unavailable. Network permissions must be empty in
manifest v1.

## 7. Large files

Whole-file media reads remain capped at 100 MiB. Viewer Pack resource
access uses `statWorkspaceFile` + bounded Range
(`RESOURCE_MAX_RANGE_READ_BYTES` = 8 MiB) so files larger than 100 MiB
are inspectable without buffering the whole body.

## 8. First-party pilot (Stage B1)

- Pack id: `ai.puppyone.viewer.glb`
- Source: `viewer-packs/glb/`
- Package: `scripts/package-viewer-pack.mjs` → `.puppyplugin` + `.sig`
- Activation: local install → registry snapshot → open `.glb` →
  `WebContentsView` loads `puppyone-plugin://…` and proves Range via
  header inspection

## 9. Verification

See `tests/viewer-packs/`:

- manifest schema / reserved ids / network reject
- signature + archive traversal reject + atomic install/disable
- disabled catalog
- router (core / plugin / cloud / chooser / no-match)
- resource broker ranges / 416 / revoke / >100 MiB metadata+slice
- app vs plugin IPC channel separation

Artifact budget: `scripts/check-packaged-artifact-budgets.mjs`
(on-demand packs must not land in base `dist/`).

## 10. Stage status

| Stage | Intent | Status |
| --- | --- | --- |
| A | Built-in viewers + budget gate | In force |
| B0 | Host foundations (store, registry, broker, session, protocols, DI) | Landed |
| B1 | First-party local `.glb` pack install/activate | Landed |
| B1+ | Verified remote catalog transport | Not started |
| C | Third-party marketplace | Not open |
| Release | Apple signing/notarization of distributed packs | Release-gated |

## 11. Anti-goals

- No general-purpose app plugin system (commands, panels, settings).
- No plugin replacement of Tier-1 editors.
- No Obsidian-style trusted plugins in the app context.
