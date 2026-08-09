# Office Preview and Editor Extension Boundary

PuppyOne ships one built-in Office capability: a lightweight, read-only,
fully local preview for supported Word, spreadsheet, and presentation files.
It does not require Microsoft Word, WPS, LibreOffice, Docker, an Office server,
or a PuppyOne Cloud API.

## Built-in preview path

```text
local workspace file
        |
        v
bounded capability URL + OOXML package validation
        |
        v
office-preview contribution
        |
        +----> DOCX: docx-preview -> sanitized Shadow DOM -> paper surface
        +----> XLSX: bounded worker parse -> virtualized spreadsheet grid
        `----> PPTX: isolated slide renderer -> thumbnail rail + slide stage
```

The built-in contribution has manifest capability `preview`; Office formats
are not marked editable. The renderer receives no binary persistence port and
does not infer editing authority from the presence of a resource URL.

Word rendering stays in `viewers/word`. Package validation and DOM budgets run
before a rendered document is committed. Generated markup is sanitized and
isolated in a Shadow Root. The preview supplies local font aliases for common
Word font names, waits for fonts before fitting, defaults to fit-to-width, and
exposes the effective zoom instead of applying an invisible scale.

This is a compatibility renderer, not Word's layout engine. Explicit OOXML
page breaks, page dimensions, headers, footers, tables, images, and embedded
fonts are preserved where `docx-preview` supports them. Pagination inferred by
Word's proprietary line-breaking engine can still differ, especially when the
original font is unavailable. That limitation must remain honest in product
and test documentation.

Legacy `.doc` and `.rtf` may use the macOS system converter to produce a
temporary DOCX preview. This does not depend on an installed office suite and
does not grant editing authority.

## Optional editor plugin handoff

An Office editor is a separate product capability. Shared UI reserves only the
opaque `OfficeEditorAction` / `OfficeEditorActionResolver` boundary:

```text
content-local floating action
        |
        v
explicit “Edit with …” action supplied by the App Host
        |
        v
future trusted plugin host owns engine, session, persistence, and isolation
```

With no installed provider the resolver is absent, no edit action is rendered,
and the local preview is unchanged. A provider must be launched explicitly by
the user; it must not silently replace the default preview. The action is a
host-owned closure, so shared UI receives neither engine credentials nor raw
plugin capabilities.

This reserved handoff does not make Viewer Pack v1 editable. Viewer Pack v1
remains read-only. Shipping an OnlyOffice or another Office editor plugin
requires a separately reviewed editor-plugin contract covering binary atomic
writes, conflicts, close semantics, native-surface isolation, package size,
licensing, and trust. None of that runtime is built into the default app.
