# Viewer Extension and Dormant Viewer Pack Architecture

**Status:** The versioned preset Viewer Contract is active. A Stage B0/B1 local
Viewer Pack Host implementation is retained as a dormant external adapter. The
signed default product uses the `preset-viewers-only` profile: no Pack schemes,
Host, IPC/preload bridge, active install path, catalog, or signer requirement is
registered or loaded into the startup graph. An opt-in experimental Plugins
surface may list compiled official viewers in that profile, but its local Pack
installation control remains unavailable unless main explicitly supplies the
capability bridge. A future explicitly enabled external-Pack profile remains
fail-closed without a reviewed production signer. Stage C (third-party
marketplace) is not open or committed.

## 1. Decision and scope

PuppyOne's production viewer surface is the immutable
`PRESET_VIEWER_REGISTRY`. Markdown, text/code, CSV, HTML, Office, image, PDF,
audio, video, and the placeholder are reviewed contributions compiled with the
application. Adding one requires one canonical manifest definition, one trusted
implementation binding, and canonical format data only when a new format route
is needed—not an App-shell or source-acquisition branch.

Viewer Packs are a reserved adapter for potentially extending local file
viewing without growing the base installer with every vertical runtime. They
are deliberately narrower than a general desktop plugin system and are not
enabled in the default product.

- Built-in editors and functional previews always win.
- Only a placeholder-grade, explicitly local document is plugin-eligible.
- Packs render files; they do not add commands, panels, settings, agents, or
  background startup hooks.
- V1 has no network permission, cloud-file access, or related-file access.
- The catalog transport remains disabled. No marketplace backend or concrete
  Pack is part of the current product scope.

```text
presetViewerManifest.json + canonical resolveFileFormat()
          |
          v
versioned PRESET_VIEWER_REGISTRY ---> content/resource acquisition ---> render/load
          |
          `..... ViewerExtensionHostAdapter (product capability OFF by default)
                       |
                       `--> main-owned activation + sandbox, only if enabled
```

## 2. Authority model

The Electron main process is the sole authority for:

- the assigned workspace root;
- core-versus-plugin routing;
- trusted signing identities;
- package installation and enabled state;
- Viewer Pack sessions and bounds;
- document handles and Range reads.

The app renderer may request a plugin id and render a surface slot, but it does
not choose a package path, version, content hash, entry point, document
revision, or filesystem grant. The main process derives all of those again
from its own state.

```text
app renderer (presentation hint)
        │ activate { pluginId, claimed root, relative path, bounds }
        ▼
trusted app IPC
        │ validate sender + canonical assigned workspace
        ▼
main-process activation authority
        ├─ stat canonical local file
        ├─ resolve format from shared fileFormats.json
        ├─ classify capability from shared presetViewerManifest.json
        ├─ route against validated enabled-pack snapshot
        └─ derive version/hash/entry/permissions/revision
        ▼
sandboxed WebContentsView + audience-bound resource broker
```

Possession of a path is never authority.

## 3. Routing contract

Routing runs twice for good UX and one time for authority:

1. shared-ui computes a renderer-side preview of the route.
2. On activation, main authorizes the sender's workspace and re-runs the route.
3. Only the main result can create a session.

The authoritative order is:

1. Resolve the core format from the same `fileFormats.json` used by shared-ui,
   then map its `defaultViewer` through the same `presetViewerManifest.json`.
2. If core capability is `edit` or `preview`, return core.
3. If the source cannot be proven to be local, fail closed.
4. Match enabled, compatible packs against observed filename suffixes and the
   actual MIME type.
5. Prefer the longest matching compound extension (`.tar.gz` over `.gz`), then
   MIME.
6. Zero matches means the normal unsupported preset fallback. In an explicitly
   enabled external-Pack profile only, one match means plugin and multiple
   equal-priority matches mean chooser; its local install CTA may be injected
   only in that profile.

The main process never accepts `coreViewerCapability` or a contribution object
from the renderer.

## 4. Package and trust model

### 4.1 Package files

```text
example.puppyplugin       # ZIP payload
example.puppyplugin.sig   # detached JSON signature envelope
```

The envelope is versioned and includes:

- `algorithm: Ed25519`;
- `keyId`;
- signer `publisher`;
- package SHA-256;
- the Ed25519 signature over the exact archive bytes.

The manifest publisher must equal both the envelope publisher and the
publisher pinned to that key id.

Production public keys are compiled into the signed application. Runtime
environment variables are never a production trust root. Development test
keys require an unpackaged app plus an explicit test flag. Removing a key from
the compiled key ring revokes installed packs signed by that key on next app
start.

`npm run check:viewer-pack-trust` skips the default `preset-viewers-only`
profile. It intentionally blocks any explicitly enabled external-Pack release
when the production key ring is empty. Private keys never belong in this
repository; release CI or an offline signing process owns them.

### 4.2 Strict manifest v1

The host rejects unknown fields and validates:

- reverse-domain-style package id and strict SemVer version;
- valid PuppyOne engine range and Viewer API `1`;
- normalized, non-traversing entry path;
- local-only sources;
- unique extensions, MIME types, format ids, and activation events;
- `defaultViewer === "plugin:<manifest.id>"`;
- no reserved core viewer ids;
- read-only formats;
- `metadata` plus `readRange` when the viewer consumes a resource;
- `relatedFiles: "none"` and `network: []` in v1.

An incompatible engine range is rejected at install and ignored if discovered
in existing state after an app update.

### 4.3 Host-owned installation

When and only when the external-Pack profile is explicitly enabled, the install
CTA invokes a main-process file picker. Package bytes never cross the
app-renderer bridge. Main opens the two selected files with no-follow semantics,
validates regular-file type and size, and only then allocates. The default
profile never constructs this CTA or exposes its bridge.

Install order:

1. Read the bounded archive and signature envelope.
2. Verify digest, trusted key id, signature, and publisher.
3. Inspect the ZIP central directory before decompression.
4. Reject traversal, absolute paths, case collisions, symlinks, encryption,
   unsupported compression, ZIP64/multi-disk input, excessive entries, size,
   or compression ratio.
5. Extract into a host quarantine directory.
6. Validate manifest, engine compatibility, entry inventory, and hashes.
7. Rename into a content-addressed immutable directory.
8. Atomically commit the enabled registry record.
9. Revoke old live sessions and retain at most the current and previous
   content generation for rollback.

Registry mutations are serialized. A failed state commit removes newly staged
content and leaves the previous enabled record untouched.

### 4.4 Store layout

```text
<userData>/viewer-packs/
├── registry-state.json
├── grants.json
├── quarantine/
├── downloads/
└── packages/
    └── <plugin-id>/
        └── <version>/
            └── <content-hash>/
                ├── manifest.json
                └── viewer assets
```

Store directories/files use owner-only permissions where supported. Installed
content is sealed read-only. Every served asset must be present in the install
inventory and match its expected size and SHA-256; symlinks and realpath
escapes are rejected at serve time as well as install time.

## 5. Runtime isolation

Each activation creates one temporary-partition `WebContentsView` with:

- `sandbox: true`;
- `contextIsolation: true`;
- Node integration disabled in pages, workers, and subframes;
- `webSecurity: true` and `<webview>` disabled;
- a PuppyOne-owned fixed preload;
- WebGL disabled unless declared (WebGPU declarations use the GPU-enabled
  profile);
- DevTools, downloads, permission requests, and popup creation disabled.

`puppyone-plugin://<id>/<content-hash>/...` is registered on that session only
and bound to the exact pack id/hash. It injects a restrictive CSP. Inline
scripts, eval, frames, forms, objects, arbitrary navigation, `file://`, HTTP,
WebSocket, and cross-pack assets are denied. WASM and workers are enabled only
when declared.

The fixed preload exposes only `window.puppyoneViewer`; it never exposes
`ipcRenderer`, `puppyoneDesktop`, Node, arbitrary filesystem paths, or shell
execution.

## 6. Host API v1 and permission enforcement

Available surface:

- `version`;
- `document.getMeta()`;
- `resource.open()`;
- `resource.readRange()`;
- `resource.createRangeUrl()`;
- `resource.close()`;
- `ui.setState()`;
- `ui.getTheme()`.

The API object may expose a method for a uniform SDK shape, but each privileged
handler checks the activated manifest permission again in main. A metadata-only
pack cannot open or read a resource. V1 intentionally has no plugin-triggered
external-open method; the trusted app UI owns that user action.

Plugin UI state is normalized and size-bounded before main forwards it to the
owning app window. Theme state comes from Electron's native theme.

## 7. Large local files

`resource.open()` re-resolves the already-authorized workspace entry, rejects
symlinks, opens a regular file with no-follow semantics, and keeps that file
descriptor for the handle lifetime. The handle is bound to:

- plugin id;
- plugin instance id;
- owner window id;
- document path;
- revision/inode identity;
- expiration and byte budget.

Reads are positional and bounded to 8 MiB each. Per-handle concurrency, open
handle count, cumulative bytes, and TTL are bounded. In-place mutation revokes
the handle; atomic replacement continues to expose the pinned old revision
until the session is closed.

`puppyone-resource://handle/<opaque-token>` provides GET/HEAD/OPTIONS with
single-range HTTP semantics, suffix ranges, correct 206/416 headers, no-store,
and no whole-file fallback for large files. The protocol is registered only in
the owning temporary partition, so copying a URL to another session does not
grant access.

## 8. Lifecycle and revocation

The host destroys sessions and closes file descriptors when:

- another document replaces the committed preview;
- the workspace changes, is released, or returns home;
- the owner window closes;
- a pack is updated, disabled, or uninstalled;
- pack navigation/load fails or its renderer process exits;
- the app quits.

Uninstall is path-validated, user-confirmed in main, and commits disabled state
before deleting package bytes. A renderer string can never become a recursive
delete path.

## 9. Diff capability boundary

Viewer Pack v1 is explicitly not a diff plugin API. A normal activation grants
one current document revision; it does not grant Git refs, the index, working-
tree snapshots, or a second immutable resource. Built-in Source Control rich
diffs use a separate main-process authority and audience-bound broker described
in [Format-Aware Diff Pipeline](../git/format-aware-diff-pipeline.md).

Opening diff capability to packs would require a separately versioned manifest
permission, trusted before/after derivation, two-revision disclosure UX,
independent byte/read budgets, session revocation, and marketplace review. The
host must fail closed until that design exists; an existing single-document
`readRange` grant cannot be reused or widened implicitly.

## 10. Catalog and future marketplace

The current stage does not need a marketplace backend. The dormant Host owns a
disabled catalog interface so a future, separately approved delivery issue can
add a verified transport without changing routing or installation authority.

A future service may publish a static signed index and immutable package
objects through object storage/CDN. It must not return executable catalog
metadata that bypasses the same signature envelope, manifest validation,
quarantine, or main-process activation checks. Opening a file must never cause
an implicit network request; discovery is an explicit user action.

### 10.1 Product surface and terminology

`Integrations` and `Plugins` are separate product domains:

- Integrations authorize cloud services and create synchronization workflows.
- Plugins extend local file presentation. The V1 executable package remains
  the deliberately narrow `Viewer Pack`; it is not a general desktop plugin.

The experimental Plugins page is off by default. A local renderer preference
may opt into the page, and a separate Appearance preference may hide its
workspace-navigation shortcut. Those preferences are presentation gates only:
they cannot register privileged schemes, expose preload APIs, select trusted
signers, or turn on the main-process Host. Turning the experiment off also
removes the external Viewer adapter from the editor pipeline.

The page presents two different sources without conflating their authority:

1. `Built-in` official viewers are derived from the active preset Viewer
   Contract, compiled with the signed app, immutable, and shown as Included.
2. `Installed` Viewer Packs come only from the main-issued, verified registry
   snapshot. The renderer never scans the package store or interprets package
   manifests directly.

The default product therefore provides an honest Plugins preview without
pretending a marketplace exists. Local install becomes actionable only in an
explicit external-Pack build profile with a reviewed signer root. Online
catalog distribution remains a separate delivery stage.

## 11. Packaging and size budget

Viewer payloads are excluded from Electron Builder `files` and base `dist/`.
The dormant host source, `jszip`, and SemVer validator remain packaged for the
experimental profile, but the preset-only main startup graph dynamically stops
before importing them. The Plugins catalog/management page is a separate lazy
chunk loaded only after the user opens that experimental view. The executable
renderer extension surface is an independent lazy chunk and is not loaded
unless the main-issued preload bridge exists and an extension surface is
actually requested.

`scripts/check-packaged-artifact-budgets.mjs` rejects embedded
`.puppyplugin` payloads. `scripts/check-viewer-pack-release.mjs` skips the
default preset-only profile and rejects an explicitly enabled external-Pack
release without a production trust root. Packaged enablement comes from the
source `package.json` capability inspected by preflight; Electron Builder
`extraMetadata` is forbidden from overriding it. Development environment flags
never affect release preflight. Unpackaged development may opt in with
`PUPPYONE_ENABLE_EXTERNAL_VIEWER_PACKS=1`.

## 12. Verification

`tests/viewer-packs/` covers:

- strict manifest and engine compatibility;
- envelope signature trust and packaged/dev key separation;
- hostile ZIP paths and bounded extraction;
- content-addressed install, rollback, tamper detection, and safe uninstall;
- authoritative core/local route and compound-extension priority;
- app/plugin IPC separation and workspace authorization;
- CSP, file/network denial, and pack-origin binding;
- revision-pinned resource ranges, suffix/invalid ranges, HEAD, and revocation;
- packaged runtime dependency classification.

`tests/viewerRegistryContract.test.ts` covers manifest parity, exhaustive format
coverage, source shapes, order, fallback, semantic combinations, and executable
lazy boundaries. `tests/viewerHost.integration.test.ts` covers the default
placeholder, loading/error/external-open states, and local/cloud adapter gate.
`tests/viewerPackFeatureGate.test.mjs` proves default-off product metadata,
packaged environment fail-closure, preload bridge omission, zero default runtime
imports/schemes, release-profile integrity, explicit opt-in, and signer
enforcement.

`npm run smoke:viewer-pack` exercises a real hidden Electron window, signed
fixture install, custom protocols, fixed preload, `WebContentsView`, and Range
read. The release pipeline must additionally build an unpacked application and
inspect `app.asar` for production runtime dependencies.

## 13. Stage status

| Stage | Intent | Status |
| --- | --- | --- |
| Preset | Versioned built-in contribution contract + deterministic registry | Active default product |
| External adapter | Product capability seam | Reserved; default off |
| B0 | Local host, registry, broker, sandbox, protocols | Experimental implementation retained; not registered by default |
| B1 | Signed first-party local pack path | Dormant; explicit profile requires production public key |
| B1+ | Explicit verified remote catalog | Not started or committed |
| C | Third-party marketplace | Not open or committed |
| Release | App signing/notarization + Viewer Pack trust root | Applies only to an explicitly enabled external-Pack profile |
