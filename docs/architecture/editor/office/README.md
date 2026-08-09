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

Spreadsheet preview keeps the application shell themed while presenting the
worksheet itself on a stable light canvas, matching the familiar workbook
metaphor without pretending to reproduce Excel's style engine. The worker
preserves formatted display values, native cell kinds for alignment, column
widths, merges, physical row/column labels, and sheet order. The viewport is
keyboard-scrollable and exposes virtualized row/column counts to assistive
technology. Original fills, fonts, borders, charts, images, and pivots remain
an explicit lightweight-preview limit.

Presentation preview uses one application-colored stage and one thumbnail
rail around the slide's own visual surface. It does not add an imitation
PowerPoint ribbon or a second file header. Slides fit the available stage,
thumbnail rendering remains lazy, and arrow/Page/Home/End navigation works
from the focused stage. A presentation-specific semantic accent marks the
active thumbnail without reusing an unrelated HTML token.

The Office shell has an Electron computed-layout regression:

```bash
npm run smoke:office-preview-layout
```

It verifies the worksheet canvas, semantic alignment, row height, sticky row
and column headers, bottom sheet tabs, presentation canvas unification,
responsive thumbnail-rail widths, hidden stage overflow, and navigation
placement using Chromium's computed layout rather than source-text assertions.

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
