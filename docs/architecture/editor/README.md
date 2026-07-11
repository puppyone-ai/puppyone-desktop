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
        +........ dormant external adapter (default off)
        |
        v
Content / resource acquisition
        |
        v
Committed preview document
        |
        +----> Markdown editor
        |
        +----> Text / code editor
        |
        +----> CSV table editor
        |
        +----> HTML viewer
        |
        +----> Office preview
        |
        +----> Image / PDF / audio / video viewer
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
- format-specific preview and editing architecture;
- the dormant, capability-gated external Viewer Pack adapter boundary.

It does not own Explorer loading and tree state, app-shell navigation,
workspace binding, or native-window lifecycle. Those remain in their focused
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
4. [Markdown Editor](markdown/README.md)
   - The format-specific source-first architecture and Live Preview UX contract
     for Markdown files.

## Adding a format-specific editor

A format-specific editor belongs under this directory when it has durable
architecture beyond the shared viewer pipeline. Use a focused subdirectory,
for example:

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

## Reading order

Start with the file-format pipeline, then read the preview lifecycle. Read a
format subdirectory only for the format being changed. Consult the plugin
document only when work affects the viewer registry boundary or distribution
model.

## Current implementation status

1. The canonical File Format registry and versioned preset Viewer Registry are
   active production paths. Existing Markdown, text/code, CSV, HTML, Office,
   image, PDF, audio, video, and placeholder viewers are built-in preset
   contributions; they are not downloaded packages.
2. The external Viewer Pack Host has an experimental implementation and
   security coverage, but the signed default product uses the
   `preset-viewers-only` profile. That profile does not register Pack schemes,
   create a Host, expose Pack IPC/preload APIs, or inject installation UI.
3. A future signed build may explicitly enable the external adapter through
   package capability metadata. Catalog, publisher, marketplace, and concrete
   third-party Pack delivery remain uncommitted work and require a separate
   issue.
