# Editor and Viewer Architecture

This directory is the architecture home for PuppyOne's file editing and
preview subsystem. It covers the lifecycle after a workspace node is selected:
format classification, source acquisition, preview commitment, viewer
selection, editing, and format-specific rendering.

## System boundary

```text
Explorer selection
        |
        v
Format registry
        |
        v
Preset Viewer Registry
        |
        | format + capability + source requirement
        v
Content / resource acquisition
        |
        v
Committed preview document
        |
        v
EditorHost + PresetViewerRenderer
        |
        +----> read-only Viewer Contribution
        |        HTML / Office / image / PDF / media
        |
        `----> editable Editor Contribution
                 Markdown / text / code / CSV / PuppyFlow
                          |
                          | revision change + readSnapshot()
                          v
                 DocumentEditingSession
                          |
                          v
                 Local FS / Cloud persistence port
```

The Explorer owns selection, not rendering. The format and viewer registries
own the decision about which format-specific surface receives a committed
document. A file-level HTML viewer and an HTML block embedded in Markdown are
therefore different architectural layers even when both eventually render
HTML.

This subsystem owns:

- file format classification and viewer routing;
- text/content versus binary/resource acquisition;
- loading, error, unsupported, and committed-preview states;
- editable versus read-only capability decisions;
- the versioned, immutable preset Viewer Contribution contract and registry;
- the small editable-contribution revision/snapshot boundary;
- the shared save lifecycle and navigation/close flush contract;
- format-specific preview and editing architecture;
- the dormant, capability-gated external Viewer Pack adapter boundary.

It does not own Explorer loading and tree state, app-shell navigation,
workspace authorization, or native-window lifecycle. Those remain in their focused
architecture documents one level above this directory.

## Authoritative documents

1. [File Format and Viewer Pipeline](file-format-viewer-pipeline.md)
   - The primary end-to-end contract from format detection through viewer
     selection, source acquisition, editing capability, and fallback states.
2. [Smooth Preview Transitions](smooth-preview-transitions.md)
   - Selection, loaded content, committed preview documents, and editor mount
     lifecycle without stale content or visual flashes.
3. [Viewer Plugin Architecture](viewer-plugin-architecture.md)
   - The experimental local Host retained behind a default-off product
     capability, its security boundary, and the reserved future distribution
     adapter. It is not a marketplace commitment.
4. [Document Editing and Persistence](document-editing-persistence.md)
   - The intentionally thin `DocumentEditingSession`, the editor-side
     revision/snapshot adapter, Local/Cloud persistence ports, navigation/close
     flush behavior, and the conservative external-change policy.
5. [Markdown Editor](markdown/README.md)
   - The format-specific source-first architecture and Live Preview UX contract
     for Markdown files.
6. [Desktop Renderer Performance](../desktop-renderer-performance.md)
   - The urgent/deferred scheduling, Explorer virtualization, Markdown
     projection, snapshot, cancellation, worker-index, and production Electron
     performance contracts shared by Explorer and the editor.

## Adding a format-specific editor

A new editor must fit the shared boundary, not copy the shared save stack:

```text
format-specific model and UI
          |
          +----> reportRevision({ revision, dirty })
          +----> readSnapshot() -> canonical file content
          `----> replaceContent() for an accepted external version
                              |
                              v
                   DocumentEditingSession
```

For a normal text-backed or structured single-file editor, adding the
contribution must not require changes to `DataWorkspace`, `EditorHost`,
`DocumentEditingSession`, persistence ports, Electron IPC, or window-close
coordination. The new format supplies its component, contribution registration,
source adapter, serializer when needed, and focused tests.

A format-specific architecture package belongs under this directory only when
the format has durable architecture beyond that shared contract. Use a focused
subdirectory, for example:

```text
editor/
  markdown/
  spreadsheet/   # only when a dedicated architecture document is needed
  document/      # only when a dedicated architecture document is needed
```

Do not create a folder merely because a viewer component exists. The shared
pipeline document remains the source of truth until a format has enough unique
editing, rendering, security, or round-trip rules to justify its own
architecture package.

Binary editing and one operation spanning multiple files are separate
capabilities. Do not enlarge the common text-snapshot contract until a real
editor requires one of them.

## Reading order

Start with the file-format pipeline, then read the preview lifecycle. Read a
format subdirectory only for the format being changed. Consult the plugin
document only when work affects the viewer registry boundary or distribution
model.

## Current implementation status

1. The canonical File Format registry, serializable Preset Viewer manifest, and
   versioned implementation registry are active production paths. The manifest
   is the single source of truth for capability, source, and runtime metadata;
   the registry binds reviewed React implementations without repeating those
   authority fields. Existing Markdown, text/code, CSV, HTML, Office, image,
   PDF, audio, video, PuppyFlow, and placeholder viewers are built-in
   contributions.
2. The external Viewer Pack Host has an experimental implementation and
   security coverage, but the signed default product uses the
   `preset-viewers-only` profile. That profile does not register Pack schemes,
   import the main-process Pack runtime, create a Host, expose Pack IPC/preload
   APIs, load the renderer Pack chunk, or inject installation UI.
3. A future signed build may explicitly enable the external adapter through
   package capability metadata. Catalog, publisher, marketplace, and concrete
   third-party Pack delivery remain uncommitted work and require a separate
   issue.
4. Built-in editable contributions share the host-owned
   `DocumentEditingSession` and Local/Cloud persistence ports. Markdown and
   text/code, CSV, and PuppyFlow use the same narrow revision/snapshot
   attachment path. Format components no longer receive or call session save
   methods. Watcher-driven clean reload, dirty conflict preservation, and
   explicit reload/keep-local resolution are active; side-by-side comparison
   and format-aware merge remain follow-up UX. Multi-agent merge, CRDT, binary
   editing, and multi-file transactions are not part of the current Editor
   contract.
