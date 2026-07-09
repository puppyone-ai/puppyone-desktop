# Viewer Plugin Architecture (Reserved)

**Status: reserved, deliberately not built.** This document records the
long-term extensibility architecture for file viewers so that today's
code keeps the option cheap. Nothing in here is current work. The only
parts in force right now are the disciplines in §7 — they are also
mirrored as invariants in
[File Format and Viewer Pipeline](file-format-viewer-pipeline.md).

## 1. The problem this reserves for

File formats are an unbounded set. The core app can and should ship
viewers for universal knowledge-work formats, but it must never try to
absorb the long tail — 3D scenes, game asset databases, CAD, medical
imaging, proprietary vertical formats. At some point users will bring
formats we will not own. The scalable answer is a viewer plugin system:
third parties register formats and ship sandboxed preview surfaces.

We are not building it yet (see §8 for triggers). We are keeping the
seam clean so that building it later is an exposure of existing
boundaries, not an invention of new ones.

## 2. The built-in / plugin boundary

The test for whether a format belongs in the core:

> Would an ordinary user accept "install a plugin first" the first time
> they open this file type?

- **Built-in (answer: no).** Text, Markdown, code, JSON, CSV, images,
  PDF, audio/video, HTML, and the Office document family. These are
  table stakes; shipping them as plugins would read as a broken product.
  Their weight is controlled by lazy loading and the bundle budget gate,
  not by eviction.
- **Plugin (answer: yes).** Everything vertical or professional: 3D,
  game assets, CAD, scientific/medical, proprietary formats. None of
  these are ever built in — the first real demand becomes the plugin
  system's pilot case.
- **Escape hatch (always).** The external-open surface remains available
  for every format regardless of tier, before and after plugins exist.

## 3. Target architecture

A viewer plugin is exactly the pair the internal pipeline already uses:
declarative format registration plus a rendering surface.

```text
plugin package
├── manifest.json          format registration + viewer declaration
└── viewer bundle          runs in a sandboxed surface, talks to a host API

host (main app)
├── format registry        merges plugin manifest entries with fileFormats.json
├── viewer registry        routes matches to the plugin's sandboxed surface
├── plugin host            sandboxed iframe/webview + postMessage bridge
└── host API               the only capabilities a plugin ever gets
```

**Manifest.** A superset of a `fileFormats.json` entry — the schema is
already the right one:

```jsonc
{
  "id": "gltf-viewer",
  "publisher": "…",
  "version": "1.0.0",
  "formats": [
    {
      "id": "gltf",
      "label": "glTF Scene",
      "extensions": [".gltf", ".glb"],
      "mimeTypes": ["model/gltf+json", "model/gltf-binary"],
      "category": "binary",
      "defaultViewer": "plugin:gltf-viewer"
    }
  ],
  "viewer": {
    "entry": "dist/viewer.html",
    "source": "resource"            // same semantics as EditorViewer.source
  }
}
```

**Rendering surface.** The plugin viewer runs inside a sandboxed
iframe/webview. It never touches app DOM, app CSS, Node, or Electron
APIs. The Phase 2 `docx-preview` isolation container in the office
viewer is the in-house prototype of exactly this surface.

**Host API.** The complete capability set, delivered over a postMessage
bridge. Small by design — viewers are the most tractable plugin surface
precisely because this is all they need:

```ts
interface ViewerHostApi {
  // input
  getDocumentMeta(): { path: string; name: string; mimeType: string | null };
  getFileUrl(): Promise<string>;        // streamed resource (Range-capable)
  readFileText(): Promise<string>;      // only if manifest declares "content"
  // output / actions
  setState(state: "loading" | "ready" | "error", message?: string): void;
  requestSave(content: string): Promise<void>;   // only if manifest declares editable
  openExternal(): Promise<void>;
  // environment
  getTheme(): { mode: "light" | "dark"; tokens: Record<string, string> };
  onThemeChange(cb: (theme: ReturnType<ViewerHostApi["getTheme"]>) => void): void;
}
```

Anything not in this interface is not available to plugins. Permissions
beyond it (network access, workspace-wide reads) would be explicit
manifest-declared capabilities with user consent — designed only when a
real plugin needs them.

## 4. How today's pipeline maps onto it

| Today (internal) | Future (plugin) |
| --- | --- |
| `fileFormats.json` entry | `manifest.formats[]` entry |
| `EDITOR_VIEWERS` registration | Plugin host registering `plugin:<id>` viewers |
| `EditorViewer.source` contract | `manifest.viewer.source` |
| `EditorViewerContext` props | `ViewerHostApi` over postMessage |
| Office viewer isolation container | The sandboxed plugin surface |
| Dynamic `import()` of heavy parsers | Plugin bundle loaded on demand |

The mapping is 1:1 by construction. That is the point of the §7
disciplines: built-in viewers are plugins that happen to ship in the
box, so the eventual plugin API is validated by a dozen first-party
consumers before it is ever public.

## 5. Security model (fixed early, on purpose)

- Plugin code executes only inside the sandboxed surface; no Node, no
  Electron, no app globals, ever. This is non-negotiable and simpler to
  hold than to retrofit (the Obsidian model — trusted plugins in the
  app context — is explicitly rejected).
- The postMessage bridge validates origin and plugin identity per
  message; the host API is the whole attack surface and stays reviewable
  at a glance.
- Plugin packages are signed; unsigned plugins never load. Marketplace
  or registry curation is a distribution question (§6), not a security
  boundary.
- A crashing or hanging plugin viewer degrades to the unsupported state
  with the external-open action — it must never take the app down.

## 6. Distribution staging

1. **Stage A — in the box (now).** Built-in viewers, lazy chunks,
   budget gate. No plugin machinery.
2. **Stage B — first-party packs.** The same plugin format, but authored,
   signed, and hosted by us; downloadable on demand instead of shipped.
   Motivation: installer size, and dogfooding the manifest/sandbox/host
   API with zero third-party risk. An existing built-in family (the
   office pack is the natural candidate) is ported onto the plugin host
   as the proof.
3. **Stage C — third party.** Public manifest schema, versioned host
   API, signing + distribution channel, docs. Only after Stage B has
   burned in.

## 7. Disciplines in force today

These are the pre-commitments that keep the plugin option cheap. They
cost nothing now and are enforced through the pipeline doc's invariants
and the bundle budget gate:

1. **Contract boundary.** Viewers depend only on the `viewerTypes`
   contract (`EditorViewer`, `EditorDocument`, `EditorViewerContext`).
   A viewer that imports app internals is a future plugin that can't be
   extracted.
2. **Data-driven registration.** New formats enter through
   `fileFormats.json` + one `EDITOR_VIEWERS` entry only. The JSON entry
   is the future manifest; keep it declarative.
3. **Isolation for heavy render surfaces.** Document-controlled content
   (Office HTML, sandboxed HTML preview) renders inside an isolated
   container (iframe / shadow root) with a minimal explicit bridge —
   the future plugin sandbox, prototyped in-house.
4. **Lazy loading + budget gate.** Heavy parsers load via dynamic
   `import()` only; the build fails if they leak into the entry chunk.
   Adding formats must not add startup weight — that property is what
   makes "built-in" viable for the whole universal tier.

## 8. Triggers — when to actually build it

Build Stage B/C when one of these becomes true, not before:

- A real user/vertical demand lands for a format we do not want to own
  (the 3D / game-asset / CAD class).
- Installer size pressure makes on-demand first-party packs worth it.
- Ecosystem becomes product strategy (marketplace, community formats).

When triggered, the first milestone is always: port one built-in viewer
family onto the plugin host and ship it in the box as a plugin. If that
works invisibly, the architecture is real; then open it.

## 9. Anti-goals

- No general-purpose app plugin system (commands, panels, file-tree
  hooks, settings pages). Viewers only. Broad plugin APIs are where
  maintenance economics die; the viewer surface is small, stable, and
  the actual product need.
- No plugin-based replacement of Tier 1 editors (Markdown/code/CSV).
  Editing surfaces are the product core, not an extension point.
- No trusted-plugin execution model. Sandbox or nothing.
