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
Viewer registry -------- reserved viewer plugins
        |
        v
Content/resource acquisition
        |
        v
Committed preview document
        |
        +-------- read-only viewer
        |
        +-------- format-specific editor
```

This subsystem owns:

- file format classification and viewer routing;
- text/content versus binary/resource acquisition;
- loading, error, unsupported, and committed-preview states;
- editable versus read-only capability decisions;
- shared viewer and editor host contracts;
- format-specific preview and editing architecture;
- the reserved external viewer-plugin boundary.

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
   - The reserved boundary for future third-party or separately distributed
     viewers; not a commitment to ship a plugin runtime now.
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
