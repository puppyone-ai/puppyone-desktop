# Viewer Plugin Architecture

**Status: accepted target architecture; implementation is staged and has not
shipped yet.** This document is the source of truth for separately distributed
file viewers in PuppyOne Desktop. It is normative for any work that changes
viewer registration, large-resource delivery, plugin packaging, sandboxing,
or plugin distribution.

The first product surface is deliberately named **Viewer Packs**. It is not a
general-purpose application extension system. Stage B begins with
PuppyOne-authored, PuppyOne-signed packs; third-party publication remains gated
on the security and lifecycle acceptance criteria in this document.

Viewer Pack v1 is a **per-machine local Desktop capability**: a package is
downloaded or explicitly selected by the user, verified, copied into
PuppyOne's host-owned local data directory, and executed/rendered locally. No
plugin package, enabled state, permission grant, runtime, or rendered surface
is stored or executed by PuppyOne Cloud.

## 1. Product decision

File formats are unbounded. The core app should remain a dependable local-first
workspace for universal knowledge-work formats without absorbing every 3D,
CAD, game-asset, scientific, medical, database, or proprietary parser into the
base installer.

The accepted split is:

- **Core viewers.** Text, Markdown, code, JSON, CSV, common images, PDF,
  audio/video, HTML, and the Office family remain part of the default product
  experience. A user should not have to discover a pack before opening an
  ordinary document.
- **Viewer Packs.** Vertical, professional, specialist, or unusually heavy
  formats are installed on demand. The initial target is read-only preview,
  inspection, and navigation.
- **Local installation and execution.** Each desktop device owns its own pack
  store, grants, updates, and runtime. Installing a pack on one machine has no
  effect on another machine or on the web/cloud product.
- **External open.** Opening the file in a native application remains available
  before and after a pack is installed. A pack is an enhancement, never the
  only recovery path.

Code splitting remains mandatory for core viewers because it protects startup
time and runtime memory. It does **not** reduce installer size: lazy chunks are
still packaged in `dist` and `app.asar`. Separately downloaded Viewer Packs and
packaged-artifact budgets are what protect the base installer over time.

## 2. Scope and anti-goals

Viewer Pack API v1 supports:

- declarative file-format contributions;
- verified installation into the current Desktop app's local pack store;
- activation when a matching **local** document is selected;
- current-document metadata and bounded resource access;
- browser, Web Worker, WebGL/WebGPU where available, and reviewed WebAssembly;
- loading/progress/error reporting, theme delivery, and external-open actions;
- signed installation, update, rollback, disable, and uninstall lifecycle.

Viewer Pack API v1 does not support:

- arbitrary commands, menus, panels, sidebar hooks, tree hooks, or settings
  pages;
- replacement of Tier 1 editors such as Markdown, code, JSON, or CSV;
- writing the current document or mutating the workspace;
- direct Node.js, Electron, shell, process, terminal, Git, or native-module
  access;
- arbitrary network access;
- importing a plugin React component into the PuppyOne renderer;
- Chrome Extension compatibility or Electron `session.loadExtension()`;
- unsigned production packages;
- cloud-workspace file sources; v1 fails closed to the normal core
  placeholder/unsupported state for cloud files;
- server-side/remote plugin execution or a hosted runtime entrypoint;
- loading a plugin directly from a workspace, repository, project config,
  arbitrary filesystem directory, or remote URL;
- syncing installed packages, enabled versions, grants, or plugin state through
  a PuppyOne account.

Any future expansion beyond read-only viewers requires a separate architecture
decision. It must not be smuggled into v1 through an overly broad bridge method.

## 3. Existing seam and current gaps

The current pipeline already has most of the correct internal boundaries:

```text
Explorer selection
        |
        v
fileFormats.json ------> resolveFileFormat()
        |
        v
EDITOR_VIEWERS --------> EditorViewer.source
        |
        v
DataPort --------------> text content or resource URL
        |
        v
EditorHost ------------> viewer.render(context)
```

The target maps onto those boundaries without allowing third-party code into
them:

| Current internal concept | Viewer Pack target |
| --- | --- |
| `fileFormats.json` entry | validated `manifest.formats[]` contribution |
| `EDITOR_VIEWERS` match | one built-in external-viewer adapter for `plugin:<id>` |
| `EditorViewer.source` | manifest source contract, including `range-resource` |
| `EditorViewerContext` | small versioned host API through a fixed preload |
| `DataPort.getFileUrl()` | audience-bound resource handle/URL from Resource Broker |
| dynamic parser import | pack activation only after a matching file is selected |
| isolated Office/HTML surface | separate plugin WebContents and session |

The gaps that must be closed before Stage B ships are:

1. `EDITOR_VIEWERS` and the core format registry are static. There is no
   installed-pack registry or deterministic contribution arbitration.
2. The local protocol supports single byte ranges, but `readWorkspaceFile()`
   rejects a file whose total size exceeds 100 MiB before serving even a small
   range. Whole-resource requests are buffered in the main process.
3. Cloud viewers currently receive a signed URL directly. Viewer Pack v1 is
   local-only and therefore must not activate for that source. A future cloud
   provider cannot reuse the current URL exposure unchanged.
4. The main application renderer has a broad CSP because it owns cloud and
   preview features. That CSP and its `window.puppyoneDesktop` bridge are not
   acceptable plugin boundaries.
5. There is no package signature, extraction, update, rollback, revocation,
   compatibility, quota, or crash-recovery lifecycle.
6. The current bundle gate protects the renderer entry chunk and lazy-chunk
   separation, but not total `dist`, `app.asar`, unpacked resources, `.app`,
   DMG, or ZIP size.
7. Production signing, hardened runtime, and notarization are not enabled in
   the current macOS package configuration. They are release prerequisites for
   a downloadable plugin surface.

## 4. Target system architecture

```text
Optional PuppyOne catalog/download service
  signed metadata + inert package bytes only
        |
        | HTTPS download or explicit local package selection
        v
==================== local machine trust boundary ====================
Main process
  PluginPackageService ------ verify / install / rollback / revoke
  PluginRegistryService ----- read host-owned local store / resolve claims
  PluginSessionManager ------ own one activated viewer instance
  PluginResourceBroker ------ local metadata, Range, stream, revoke (v1)
        |                                  |
        | registry snapshot                | opaque, audience-bound resource
        v                                  v
Desktop renderer                    isolated plugin WebContentsView
  Shared EditorHost                   fixed PuppyOne preload
  ExternalViewerAdapter               plugin HTML/JS/Worker/WASM
  PluginSurfaceController <---------> versioned message bridge
        ^                                  ^
        |                                  |
        +---------- local display ----------+

Authorized local workspace file ------ bounded Range/stream only
```

Ownership rules:

- The **main process** is the only authority for installed packages,
  signatures, enabled versions, permission grants, active sessions, workspace
  authorization, and resource handles.
- The **shared UI package** remains platform-neutral. It accepts declarative
  viewer contributions or an injected external-viewer adapter; it never imports
  Electron or scans the filesystem.
- The **desktop renderer** owns layout, selected-document lifecycle, loading
  and fallback UI, and positioning of the plugin surface. It does not execute
  plugin source.
- The **plugin WebContents** renders exactly one activated viewer instance. It
  receives no application preload, application DOM, application CSS, Node.js,
  or Electron objects.
- The **Resource Broker** is the only route from a plugin to authorized local
  bytes in v1. Possession of a workspace path is never authority. A future
  cloud provider must implement the same opaque contract rather than exposing
  cloud credentials.
- The **remote catalog**, when used, distributes signed metadata and inert
  package bytes only. It never hosts the active viewer page, receives document
  data, or participates after a verified package has been installed.

One global main-process registry may serve multiple PuppyOne windows, but each
activated viewer session is scoped to one owner window and one committed
document. Closing the window, switching the committed document, disabling the
pack, or revoking the package destroys the session and all resource handles.

### 4.1 Local-machine invariants

- Production packages are loaded only from the immutable version directory
  under PuppyOne's `userData` pack store. The app never evaluates an entrypoint
  from the download cache, workspace, temporary extraction directory,
  user-supplied path, or network URL.
- A workspace cannot declare, install, enable, or auto-load a pack. Opening an
  untrusted repository therefore cannot create a plugin execution path.
- Marketplace download and explicit “Install Viewer Pack…” file selection feed
  the same verifier/installer. A selected local file is not executed in place.
- Installed-pack state is per OS user and per machine. V1 does not sync package
  binaries, enabled versions, permission grants, caches, or plugin preferences.
- Pack HTML, JavaScript, CSS, Worker, WASM, fonts, and other runtime assets are
  self-contained in the verified package. Runtime CDN scripts, hosted plugin
  pages, remote imports, and install-time package managers are forbidden.
- After installation, a pack can activate offline. The marketplace is not in
  the document-open or render path.
- “Local” does not mean trusted or in-process. Every locally installed pack
  still uses the isolated WebContents/session and least-authority bridge.

## 5. Manifest and contribution model

A Viewer Pack is framework-agnostic. It ships static web assets and a manifest;
it does not share PuppyOne's React runtime or dependency graph.

```jsonc
{
  "schemaVersion": 1,
  "id": "ai.puppyone.viewer.glb",
  "publisher": "puppyone",
  "version": "1.0.0",
  "engines": {
    "puppyone": ">=0.2.0",
    "viewerApi": "1"
  },
  "activationEvents": ["onFileExtension:.glb"],
  "viewer": {
    "entry": "dist/viewer.html",
    "source": "range-resource",
    "sources": ["local"],
    "runtime": ["worker", "webgl", "wasm"]
  },
  "formats": [
    {
      "id": "glb",
      "label": "glTF Binary Scene",
      "extensions": [".glb"],
      "mimeTypes": ["model/gltf-binary"],
      "category": "binary",
      "defaultViewer": "plugin:ai.puppyone.viewer.glb",
      "editable": false
    }
  ],
  "permissions": {
    "currentDocument": ["metadata", "readRange"],
    "relatedFiles": "none",
    "network": []
  }
}
```

Manifest rules:

- `schemaVersion`, pack `id`, publisher, version, engine range, entrypoint,
  source mode, supported document sources, formats, runtime features, and
  permissions are mandatory and schema-validated before extraction is
  committed.
- IDs are lowercase reverse-domain identifiers. Core format and viewer IDs are
  reserved and cannot be claimed by third parties.
- Paths are normalized relative POSIX paths. Absolute paths, `..`, empty
  segments, control characters, symlinks, and case-colliding entries are
  rejected.
- `activationEvents` are derived from validated format contributions; a pack
  cannot request activation at application startup.
- `runtime` is declarative. The host decides whether a requested browser
  capability is supported and safe on the current platform.
- Permissions are an allowlist. Unknown permission keys fail installation;
  they are never ignored.
- `permissions.network` must be empty in Viewer API v1. External network access
  is a future capability decision, not a publisher-selected v1 option.
- A permission increase during update pauses the update until the user accepts
  the new grant.
- The entrypoint must resolve inside the verified immutable package inventory.
  URL entrypoints, import maps to remote origins, install scripts, and runtime
  dependency installation are rejected.

### 5.1 Format resolution and conflicts

The main process owns the installed-pack registry and publishes an immutable,
validated contribution snapshot to each desktop renderer. Renderers do not scan
the plugin directory or independently parse untrusted manifests.

Routing is based on **viewer capability**, not on whether a file type appears
in `fileFormats.json`. Known long-tail formats such as 3D and SQLite already
have core registry entries whose viewer is only `binary-placeholder`; treating
every defined format as core-owned would make those formats permanently
ineligible for a pack.

The deterministic v1 route is:

```text
resolve core format
        |
        +-- functional core edit/preview viewer --> core viewer
        |
        +-- core placeholder or unknown format
                  |
                  +-- non-local source ----------> core placeholder/error
                  |
                  +-- one compatible installed pack --> activate pack
                  |
                  +-- multiple installed packs ------> viewer chooser
                  |
                  +-- signed catalog recommendation -> install CTA
                  |
                  +-- no match ----------------------> placeholder/external open
```

Rules:

1. Core edit-grade and preview-grade viewers keep ownership by default. Viewer
   Pack v1 does not shadow them.
2. Both placeholder-grade core formats and `unknownFormat` are plugin-eligible.
   Eligibility is an explicit support capability, not inferred from registry
   membership.
3. The plugin branch is entered only for a local workspace/document source in
   v1. Cloud selection never creates a plugin session or resource handle.
4. Matching uses validated declarative manifests only. No plugin code runs
   during detection, catalog search, or the install prompt.
5. V1 matching uses normalized exact filename/compound extension/simple
   extension and trusted MIME metadata, following the core resolver's priority.
   Arbitrary plugin sniffing code and marketplace content upload are forbidden.
6. One compatible enabled installed pack may activate directly. If multiple
   packs match and no stable user preference exists, PuppyOne shows a chooser.
   Filesystem scan order and install time are never precedence rules.
7. A catalog match is a recommendation, not authority to download or execute.
   PuppyOne shows publisher, download size, permissions, and disk impact before
   explicit installation.
8. Missing, disabled, incompatible, or revoked packs resolve to the normal
   unsupported state plus external-open action.
9. A core viewer's transient parse/runtime failure does not silently activate
   another pack. The error UI may offer an explicit compatible-viewer action,
   but automatic fallback is limited to the declared placeholder/unknown route.

The implementation exposes this as one resolver result, for example
`coreViewerCapability: "edit" | "preview" | "placeholder"`, derived at the
viewer-registry boundary. Call sites must not duplicate extension lists or
scatter checks for the literal `binary-placeholder` ID throughout the app.

Marketplace discovery uses a locally cached, signed catalog index keyed by
declarative match data. Opening a file does not send its name, path, content,
hash, or resource token to the marketplace. Catalog refresh is an independent
product/network action, not a per-file lookup request.

The core JSON remains the canonical universal-format registry. Plugin overlays
must be injected into resolution; they must not be appended by mutating the
checked-in JSON at runtime. The shared-ui resolver and local/main-process MIME
resolver must consume the same validated snapshot or remain behaviorally
identical through explicit tests.

### 5.2 Catalog boundary and backend evolution

PuppyOne Desktop does not require a marketplace backend in order to implement
the local Viewer Pack host. The Desktop contract separates three concerns:

```text
CatalogSnapshotTransport (optional, untrusted bytes)
        |
        v
PluginCatalogService (main process, verify/cache/index/query)
        |
        +------> ViewerRouter reads cached verified recommendations only

PackageDownloadTransport (optional, untrusted bytes)
        |
        v
PluginPackageService (stage/verify/install/rollback local package)
```

The transport is optional and is never part of the plugin API. Illustrative
main-process ports are:

```ts
type CatalogState =
  | { status: "disabled" }
  | { status: "ready"; sequence: number; refreshedAt: string }
  | { status: "stale"; sequence: number; error: string }
  | { status: "error"; error: string };

interface ViewerPackCatalogTransport {
  fetchSnapshot(request: {
    etag?: string;
    signal: AbortSignal;
  }): Promise<{
    status: "not-modified" | "ok";
    etag?: string;
    signedBytes?: Uint8Array;
  }>;
}

interface ViewerPackPackageTransport {
  downloadPackage(request: {
    url: string;
    expectedBytes: number;
    expectedSha256: string;
    signal: AbortSignal;
  }): Promise<{ stagedPath: string }>;
}

interface ViewerPackCatalogService {
  getState(): CatalogState;
  refresh(signal: AbortSignal): Promise<CatalogState>;
  findCachedCandidates(match: {
    name: string;
    mimeType: string | null;
  }): readonly VerifiedCatalogEntry[];
}
```

These types describe ownership, not a promise that renderer or plugin code may
receive raw signed bytes, download URLs, or local staged paths. Only the main
process transports see network/package locations. The catalog service verifies
the signed snapshot, enforces monotonic sequence/expiry rules, stores it
locally, and exposes sanitized entries. Package download staging remains
separate from catalog refresh, and the package service independently re-verifies
the selected package before installation.

Desktop initially ships a `DisabledCatalogTransport` (or no transport at all):

- local installed-pack routing works;
- explicit installation of a signed local `.puppyplugin` works;
- no marketplace network request is attempted;
- `findCachedCandidates()` returns no marketplace recommendation when no
  verified snapshot exists;
- placeholder/external-open remains the complete fallback.

The first remote distribution stage does not need a database or always-on API.
A build/release job can publish to the existing object storage/CDN:

```text
viewer-packs/v1/stable/catalog.json
viewer-packs/v1/packages/<plugin-id>/<version>/<sha256>.puppyplugin
```

`catalog.json` is an immutable/signed logical snapshot even if a stable URL
points to its newest version. It contains only distribution metadata:

```jsonc
{
  "payload": {
    "schemaVersion": 1,
    "sequence": 12,
    "generatedAt": "2026-07-10T00:00:00Z",
    "expiresAt": "2026-07-17T00:00:00Z",
    "channel": "stable",
    "packs": [
      {
        "id": "ai.puppyone.viewer.glb",
        "publisher": "puppyone",
        "version": "1.0.0",
        "engines": { "puppyone": ">=0.2.0", "viewerApi": "1" },
        "formats": [{ "extensions": [".glb"], "mimeTypes": ["model/gltf-binary"] }],
        "permissionsSummary": { "network": false, "relatedFiles": "none" },
        "package": {
          "url": "https://downloads.puppyone.ai/viewer-packs/...",
          "sizeBytes": 1234567,
          "sha256": "..."
        }
      }
    ],
    "revocations": []
  },
  "signature": {
    "keyId": "puppyone-viewer-packs-2026-01",
    "algorithm": "Ed25519",
    "value": "..."
  }
}
```

The signature covers a specified canonical encoding of `payload`; implementations
must not invent ad hoc JSON stringification rules or include the signature field
in its own signed bytes.

The signing private key belongs in protected release infrastructure, not in the
CDN or Desktop app. Desktop pins the verification key, rejects rollback to an
older accepted sequence, retains the last valid unexpired snapshot on transient
failure, and never treats CDN transport security as a substitute for signature
verification. Package URLs are HTTPS, credential-free, and restricted by host
download policy; hashes and package signatures remain authoritative.

The Viewer Router never calls `fetchSnapshot()` while opening a file. Refresh
runs at startup delay, explicit user action, or a bounded background interval.
Routing consults only the locally cached verified index, so file selection has
no network dependency and leaks no per-file event to the catalog host.

A dedicated marketplace backend becomes justified only when the product needs
stateful workflows such as:

- third-party publisher accounts, key ownership, submission, review, and
  moderation;
- full-text search, ranking, categories, ratings, or personalized discovery;
- paid licensing, entitlements, organization-private packs, or regional policy;
- automated dependency/malware analysis and review queues;
- administrative takedown, staged rollout, analytics, and publisher dashboards.

Even then, the service outputs the same signed catalog/package contract. Search
or account APIs may enrich discovery UI, but installation authority continues
to come from a verified package and signed distribution envelope. The Viewer
Router, local pack store, sandbox, and Resource Broker do not depend on the
marketplace's internal database or deployment architecture.

## 6. Rendering container and bridge

### 6.1 Container choice

Production third-party viewers use `WebContentsView`, not Electron's `<webview>`
tag. Electron currently recommends avoiding `<webview>` because its underlying
architecture affects stability, navigation, and event routing. A sandboxed
iframe is acceptable only for a first-party prototype that never loads an
external package; it is not the Stage C security boundary.

Every plugin view uses:

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
webviewTag: false
preload: <fixed PuppyOne-owned plugin preload>
partition: <non-persistent plugin/instance partition>
```

The pack is served from a standard, secure custom origin such as:

```text
puppyone-plugin://ai.puppyone.viewer.glb/<content-hash>/dist/viewer.html
```

The custom protocol is registered on the plugin's session, not assumed to be
available through the default session. Each pack has a distinct origin. The
session denies permission requests, popups, downloads, unexpected navigation,
service workers, and external protocols. Browser storage is ephemeral by
default; durable plugin state, if introduced later, must use a quota-bound host
API.

The protocol maps only to the enabled package version in the host-owned local
store. It never proxies a hosted viewer application and never resolves assets
from the selected workspace.

The plugin session receives a generated CSP. The default policy is equivalent
to:

```text
default-src 'none';
base-uri 'none';
object-src 'none';
frame-ancestors 'none';
form-action 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: puppyone-resource:;
media-src 'self' blob: puppyone-resource:;
connect-src puppyone-resource:;
worker-src 'self' blob:;
```

Reviewed WASM support is added narrowly to the generated script policy only
when the manifest declares it. `connect-src` permits only the host-owned
resource protocol. Viewer API v1 adds no external HTTPS/WSS origins, and the
session request allowlist independently denies them. CSP alone is not the
network security boundary.

### 6.2 Fixed bridge

The PuppyOne-owned plugin preload exposes a capability wrapper such as
`window.puppyoneViewer`, never `ipcRenderer` itself and never
`window.puppyoneDesktop`.

```ts
interface ViewerHostApiV1 {
  document: {
    getMeta(): Promise<{
      id: string;
      name: string;
      mimeType: string | null;
      sizeBytes: number;
      revision: string | null;
    }>;
  };
  resource: {
    open(): Promise<{
      handle: string;
      sizeBytes: number;
      supportsRange: true;
    }>;
    readRange(request: {
      handle: string;
      offset: number;
      length: number;
    }): Promise<ArrayBuffer>;
    createRangeUrl(handle: string): Promise<string>;
    close(handle: string): Promise<void>;
  };
  ui: {
    setState(state: {
      status: "loading" | "ready" | "error";
      message?: string;
      progress?: number;
    }): void;
    getTheme(): Promise<{
      mode: "light" | "dark";
      tokens: Record<string, string>;
    }>;
    onThemeChange(callback: (theme: unknown) => void): () => void;
  };
  host: {
    openExternal(): Promise<void>;
  };
}
```

The actual API is versioned and generated from shared types. Runtime validation
is required on both sides; TypeScript types are not a security boundary.

The existing application `createTrustedIpcMain` gate remains application-only
and is not widened to admit plugin frames. Plugin messages use a dedicated,
WebContents-scoped dispatcher (or `webContents.ipc`) bound to the exact viewer
instance and its fixed preload.

Control messages use asynchronous IPC or a transferred `MessagePort`. Large
resource bodies do not traverse the general control IPC path. Libraries that
already understand HTTP Range use a short-lived `puppyone-resource://` URL;
specialized parsers use `readRange()` with transferred `ArrayBuffer` values.

The API intentionally omits absolute paths, workspace enumeration, save,
clipboard, network fetch, arbitrary URL open, and process execution. The host
may add presentation-only fields without increasing authority, but any new
capability requires an API-version and permission review.

## 7. Large-file Resource Broker

Large-file support is the primary reason for Viewer Packs, so it is a host
primitive rather than a convention left to plugin authors.

### 7.1 Required semantics

- Metadata reads do not read file bodies.
- Files larger than 100 MiB remain eligible for metadata and Range access.
- Range offsets and lengths use safe 64-bit-compatible validation and are
  tested above 2 GiB. Negative, overflowing, overlapping-abuse, and excessive
  requests are rejected.
- Each request has a host-configured maximum byte length, concurrency limit,
  timeout, and cancellation path. Exact limits are policy/configuration, not
  plugin input.
- Local responses stream from an authorized file descriptor or bounded file
  slice. They do not call `fs.readFile()` for the whole resource.
- Resource URLs implement correct `206`, `Content-Range`, `Accept-Ranges`, and
  `416` behavior. A request without Range cannot silently buffer an unbounded
  file; it is streamed under a configured response budget or rejected.
- Handles are scoped to plugin ID, plugin instance, owner window, committed
  document, source revision, and expiry. They are revoked on any lifecycle
  change and cannot be rewritten to another path.
- The plugin receives a display name and opaque document/handle IDs, not the
  workspace root or absolute filesystem path.

### 7.2 Local files

The current `puppyone-local://` capability store is a useful prototype, but the
plugin broker needs a distinct audience-bound capability. Token possession
alone is insufficient for a reusable plugin URL. The broker validates the
requesting session/WebContents where Electron provides it and always validates
the token's plugin-instance, document, path, expiry, and byte-budget scope.

Path authorization continues to use canonical workspace roots and real paths.
Symlink replacement is revalidated when a resource is opened. Long-running
sessions pin or re-check a revision identity so a file swapped after metadata
inspection does not silently become a different resource.

### 7.3 Cloud files (deferred)

Viewer Pack v1 is local-file only. Selecting a cloud document does not enter
plugin resolution, create a plugin WebContents, or mint a resource handle. The
existing core cloud viewer/placeholder behavior remains authoritative.

This scope choice does not permit a future implementation to expose PuppyOne
Cloud access tokens or the raw signed inline URL. A later cloud source provider
must sit behind the same opaque Resource Broker API: the main process obtains
or refreshes the signed URL, forwards a validated Range request, verifies
declared/actual response length and `Content-Range`, and streams only a bounded
response. Providers without reliable Range semantics must report that honestly;
the host must not disguise a full multi-gigabyte download as a preview request.

### 7.4 Related files

Multi-file formats such as `.gltf` can reference sibling `.bin`, texture, or
material files. Viewer API v1 defaults to the exact selected document.
`relatedFiles: "same-directory"` is a separate reviewed permission with a
user-visible explanation, path normalization, file-count/byte budgets, and no
parent traversal. The first pilot uses single-file `.glb` specifically so this
permission can be designed from evidence rather than guessed.

## 8. Security and failure containment

Plugins are untrusted even when their package signature is valid. A signature
proves publisher/provenance and package integrity; it does not prove that the
code is safe.

The following rules are non-negotiable:

- No plugin code runs in the PuppyOne renderer, main process, application
  preload, terminal process, or Git process.
- No plugin-provided preload path is accepted. Only the fixed preload inside
  the signed PuppyOne application may bridge capabilities.
- Every bridge request validates sender WebContents, top frame, plugin ID,
  instance ID, API version, operation schema, current permission grant, and
  active document ownership.
- The plugin session denies browser permissions through both permission-check
  and permission-request handlers.
- Navigation stays on the exact content-addressed plugin origin. New windows,
  redirects, downloads, external protocols, and top-level navigation are
  denied. `openExternal()` opens only the current document through the existing
  authorized native-app surface.
- External network access is denied in both CSP and session request
  interception for Viewer API v1. Credentials and PuppyOne cookies are never
  attached to plugin requests.
- Pack archives are treated as hostile input: path traversal, symlinks,
  duplicate/case-colliding paths, device files, encryption, ZIP64/multi-disk
  surprises, excessive file counts, expansion limits, and compression-ratio
  limits are rejected before commit.
- A plugin crash, `render-process-gone`, unresponsive event, bridge timeout, or
  repeated budget violation tears down only that viewer instance and returns to
  an error/unsupported state with external open.
- Plugin activation is lazy. Disabled or unmatched plugins execute no code and
  consume no renderer process.
- The registry scans only PuppyOne's host-owned pack store. Workspace folders,
  dotfiles, project configuration, environment variables, current working
  directories, and arbitrary user plugin folders are not discovery roots.
- No verified package asset is fetched from a remote origin at activation time.
  Marketplace availability cannot change the code of an already installed
  immutable version.

Third-party native modules and arbitrary executables are not supported.
Electron `utilityProcess` supplies a Node.js environment and is not a security
sandbox for unknown code. A future PuppyOne-authored, independently signed
compute provider may use a utility process behind a smaller protocol, but that
is a first-party architecture and is not part of Viewer API v1.

## 9. Package, installation, and update lifecycle

The distribution artifact is a `.puppyplugin` archive containing at minimum:

```text
manifest.json
dist/viewer.html
dist/<content-addressed assets>
LICENSE
NOTICE
```

Production install flow:

1. Accept either a package reference from a signed registry index over HTTPS or
   an explicit user-selected `.puppyplugin` file. The app has a pinned PuppyOne
   registry verification key and a rollback-safe index version/timestamp.
2. Copy/download the package to an app-owned temporary file with an explicit
   compressed-byte limit. Never verify or execute directly from the original
   download/user-selected location.
3. Verify expected SHA-256 and the signed package envelope before extraction.
4. Parse and schema-validate the manifest; verify publisher, engine/API range,
   permissions, paths, and package entry inventory.
5. Extract into a new temporary directory with archive budgets and no symlink
   following.
6. Re-hash the extracted inventory and compare it with the signed manifest.
7. Atomically rename to the immutable version directory, then atomically update
   the enabled-version pointer.
8. Keep the last known-good compatible version until the new version activates
   successfully. Roll back automatically after install corruption or repeated
   startup failure.
9. Load future sessions only from the committed immutable version directory;
   the original package and temporary extraction directory are not runtime
   search paths.

Suggested storage layout:

```text
<userData>/viewer-packs/
  registry-state.json
  grants.json
  packages/<plugin-id>/<version>/
  downloads/
  quarantine/
```

Plugin installation never modifies `PuppyOne.app`, `app.asar`, or its code
signature. It also never writes into a workspace. Installed packs remain
available offline. Package directories are treated as immutable and receive
restrictive per-user filesystem permissions where the platform supports them.
Uninstall first disables and destroys sessions, revokes handles, then removes
package/cache data; failure to delete is retried without re-enabling the pack.

Enabled versions, grants, crash state, and pack preferences are local machine
state. They are excluded from workspace config, project backup, cloud sync, and
portable project export. A user installs and grants the pack independently on
each device.

Stage B accepts only PuppyOne-published packages. Stage C adds curated publisher
identity, review, and a PuppyOne-signed marketplace envelope. A revocation list
and emergency kill switch are required before third-party publication. A
publisher signature alone is not a marketplace review.

Unsigned/unpacked loading is restricted to an explicit Developer Mode with a
durable warning, separate directory, no marketplace identity, and the same
sandbox/permissions. Developer Mode never weakens production package handling.

## 10. Compatibility and lifecycle versioning

- `schemaVersion` versions the package format.
- `viewerApi` versions runtime behavior and bridge methods.
- `engines.puppyone` declares host compatibility.
- Unknown schema/API major versions fail closed.
- Removed or incompatible packs remain installed but disabled, with an
  actionable compatibility message.
- API evolution is additive within a major version. Capability detection is
  explicit; plugin code must not infer host version from unrelated behavior.
- Registry snapshots include stable plugin/viewer IDs and enabled versions so
  multi-window routing is reproducible.
- Updating a pack does not hot-swap an active viewer. The new version activates
  on the next session after verification and permission review.

## 11. Size and runtime budgets

PuppyOne tracks three different budgets; they must not be conflated:

1. **Startup budget.** The existing entry-chunk and lazy-parser checks protect
   startup cost.
2. **Base distribution budget.** CI records and gates total `dist`, `app.asar`,
   unpacked resources, installed application, DMG, and ZIP size per architecture.
   A universal package is not introduced without an explicit size decision.
3. **Viewer Pack budget.** Each package has compressed, extracted, cache, and
   update-overlap limits. Settings shows per-pack and total disk usage and lets
   the user reclaim it.

The measured macOS arm64 v0.1.2 baseline on 2026-07-10 was approximately:

| Artifact | Size |
| --- | ---: |
| DMG / ZIP | 120 MiB each |
| installed `.app` | 286 MiB |
| Electron Framework | 261 MiB |
| `app.asar` | 20 MiB |
| renderer `dist` | 19 MiB |

CI thresholds should begin from an approved baseline plus a small explicit
margin, not from an unmeasured “few hundred MB” goal. Pack payloads do not ship
inside the base installer except for the minimal host/SDK and an optional
first-party reference pack approved as a core artifact.

Runtime budgets are also required:

- maximum bytes per range and maximum concurrent ranges;
- cancellation and wall-clock timeout for parsing tasks;
- maximum plugin view/process lifetime after it becomes hidden;
- WebContents responsiveness and crash-loop limits;
- GPU/context-loss recovery;
- pack cache and temporary update overlap;
- low-cardinality error counts without document names, paths, contents, URLs,
  or resource tokens.

The host must make truncation, level-of-detail, and partial-preview behavior
visible. A “successful” viewer may not silently omit content.

## 12. Delivery stages and gates

### Stage A — current core

- Built-in viewers use the shared viewer contract.
- Heavy parsers remain lazy and the startup bundle gate remains enforced.
- Placeholder formats and external-open remain honest fallbacks.
- No installed-pack runtime is shipped.
- The catalog mode is disabled; no marketplace endpoint or file-open network
  lookup is required.

### Stage B0 — host foundations

- Implement the main-process package registry and immutable contribution
  snapshot.
- Define the catalog transport/service ports with a disabled default. Do not
  hard-code a marketplace endpoint in shared-ui or the renderer.
- Create the host-owned per-machine pack store and ensure the registry has no
  workspace or arbitrary-directory discovery path.
- Add the generic desktop external-viewer adapter without importing Electron
  into shared-ui.
- Replace the 100 MiB total-file gate for bounded Range consumers with the
  streaming Resource Broker.
- Add audience-bound local handles, source gating, and cancellation. Cloud
  documents fail closed before plugin activation.
- Add complete packaged-artifact size budgets.
- Enable production macOS signing, hardened runtime, and notarization before
  distributing packs outside internal builds.

### Stage B1 — first-party pilot

The first on-demand pack is a `.glb` viewer:

- `.glb` is already a placeholder-grade 3D format in the core registry.
- It is a single-file format, so the pilot exercises large binary Range,
  Worker/WASM, GPU rendering, lifecycle, and crash recovery without guessing a
  related-files permission.
- The unsupported surface can offer “Install recommended viewer” with download
  size, publisher, permissions, and disk impact before installation.
- Distribution may begin as a CI-signed static catalog and content-addressed
  package on object storage/CDN; a dedicated marketplace backend is not a gate.

An existing built-in viewer may also be routed through the host as an in-box
reference implementation, but Office remains a default product capability.
Making table-stakes formats downloadable for a small size saving is not the
pilot objective.

Stage B acceptance requires:

- a multi-gigabyte sparse fixture can be inspected without whole-file buffering;
- disabling, uninstalling, switching documents, and closing a window revoke all
  handles and destroy the viewer session;
- denied network/workspace access is covered by tests;
- a hung or crashed viewer returns to a recoverable host state;
- installation is signature-checked, atomic, offline-capable, and rollback-safe;
- installed code runs only from the committed local pack store; packages cannot
  run in place from a workspace, download, selected file, temp directory, or URL;
- cloud files cannot activate a pack or expose a signed URL/resource handle;
- the base installer remains within its approved artifact budgets.

### Stage C — curated third party

- Publish the manifest schema, generated TypeScript API, local development
  server, packaging validator, and conformance fixtures.
- Add curated submission/review, publisher identity, malware/dependency checks,
  permission review, revocation, and security-response procedures.
- Burn in API v1 with first-party packs before accepting third-party packages.
- Keep the first marketplace release local-file only; publisher expansion does
  not implicitly expand document-source authority.
- Introduce a dedicated backend only for stateful publisher/review/discovery or
  entitlement workflows. Preserve the signed snapshot/package boundary.
- Do not add general-purpose contribution points merely to grow marketplace
  count.

### Later source expansion — cloud (separate decision)

Cloud Viewer Packs require a dedicated source-provider milestone after the
local marketplace has burned in. The milestone owns signed-URL proxying, cloud
Range conformance, cache policy, offline semantics, tenancy/credential
isolation, and cloud-specific tests. It is not part of Viewer API v1 acceptance.

## 13. Implementation seams in this repository

Implementation should follow these ownership seams:

- `vendor/shared-ui/src/core/fileFormats.json` remains the core format registry.
- `vendor/shared-ui/src/editor/viewerRegistry.tsx` gains one stable
  external-viewer adapter path; it does not import or evaluate pack code.
- `viewerTypes.ts` or a focused sibling owns serializable contribution and host
  API types. Electron-specific session types stay outside shared-ui.
- `DataWorkspace`/`EditorHost` receives the validated contribution registry and
  desktop external-viewer surface through dependency injection.
- `electron/main/` owns package, registry, session, protocol, permission, and
  resource-broker services.
- A main-process catalog service owns verified snapshot cache/query. Its
  transport is injected (`disabled`, static HTTPS/CDN, or future marketplace
  service); shared-ui, the renderer, and plugin code never fetch the catalog.
- Package download staging and package installation are separate services. A
  catalog entry is never treated as proof that downloaded bytes are installable.
- A separate fixed plugin preload lives under `electron/`; the application
  preload is not reused.
- `local-api/workspace.mjs` exposes metadata and bounded stream/range primitives
  instead of using the text or whole-file path for plugins.
- V1 routing rejects cloud sources before plugin activation. A later cloud
  resource provider stays in the main process so credentials and byte budgets
  never move into plugin code.

The installed-pack registry is a main-process source of truth. Do not add a
second renderer-side filesystem scanner. The renderer receives only validated,
serializable descriptors and session IDs.

## 14. Verification matrix

Automated coverage is required for:

- manifest schema, reserved IDs, version ranges, permission changes, and format
  conflict arbitration;
- disabled catalog behavior, signed snapshot verification, monotonic sequence,
  expiry/stale cache, ETag/not-modified refresh, malformed entries, revocations,
  and proof that file selection never performs a network request;
- transport substitution (`disabled` versus static HTTP fixture) without
  changing Viewer Router or Plugin Package Service behavior;
- package hash/signature failures, corrupt archives, traversal, symlinks,
  duplicate/case-colliding entries, ZIP bombs, and atomic rollback;
- proof that workspace/project configuration cannot install, discover, enable,
  or execute a pack, and that a selected package is copied before verification;
- trusted plugin bridge sender/frame/instance validation and ordinary app IPC
  rejection from plugin WebContents;
- default-denied network, permissions, navigation, popups, downloads, storage,
  and external protocols;
- local Range semantics, including cancellation, `416`, oversized ranges,
  stale revisions, concurrent requests, and offsets beyond 2 GiB;
- cloud-source rejection before plugin activation, with proof that no signed
  URL, credential, plugin session, or resource handle is created;
- resource revocation on selection, window, enablement, update, and crash
  lifecycle;
- multi-window ownership and cross-window token rejection;
- unresponsive/crashed plugin recovery and crash-loop disablement;
- artifact-size gates and proof that on-demand pack payloads are absent from the
  base package;
- offline activation after a previously verified install, with no remote asset
  fetch and no account/cloud synchronization of local pack state.

Manual verification covers install consent, permissions, progress, theme and
resize behavior, accessibility, external open, disk-usage cleanup, update and
rollback messaging, GPU context loss, and a large `.glb` fixture.

## 15. References

Primary references for implementation decisions:

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron `<webview>` warning](https://www.electronjs.org/docs/latest/api/webview-tag)
- [Electron custom protocols and session partitions](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron session permission handlers](https://www.electronjs.org/docs/latest/api/session)
- [Electron MessageChannelMain](https://www.electronjs.org/docs/latest/api/message-channel-main)
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron Chrome Extension support limits](https://www.electronjs.org/docs/latest/api/extensions)
- [VS Code Extension Host isolation and lazy activation](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [VS Code Webview security](https://code.visualstudio.com/api/extension-guides/webview)
- [Figma Plugin Manifest network permissions](https://developers.figma.com/docs/plugins/manifest/)
