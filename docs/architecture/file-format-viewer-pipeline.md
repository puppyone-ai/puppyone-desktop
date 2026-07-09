# File Format and Viewer Pipeline

This document has two parts with different lifetimes:

- **Part 1 — Architecture specification.** The durable contract for how a
  file name/MIME type becomes a rendered preview: the format registry, the
  viewer registry, the content/resource source pipeline, the Office
  document preview matrix, and the per-format support bar (§6) every
  required format must meet. It remains the reference for everyone adding
  a file format or viewer after the current work is done.
- **Part 2 — Implementation record and remaining limitations.** The
  completed Office/viewer remediation is archived as checked items, and
  the limitations that still affect security, fidelity, performance, or
  cloud parity remain explicit. It is a release-readiness record rather
  than a second source of implementation requirements.

---

# Part 1 — Architecture specification

## 1. Scope and design goal

Every file the user selects — local workspace or cloud project — flows
through one pipeline that answers three questions in order:

1. **What is this file?** — the format registry.
2. **Which viewer renders it?** — the viewer registry.
3. **What data does that viewer need?** — the source pipeline (text
   content, a streamable resource URL, both, or nothing).

The design goal is a single source of truth per question. A new format is
added by editing data (the registry JSON) and, only if it needs a new
rendering surface, one viewer entry. Nothing else in the app hard-codes
extensions or MIME types.

```text
name + mimeType
      │
      ▼
fileFormats.json ──► resolveFileFormat() ──► FileFormat { defaultViewer, category, … }
      │                                             │
      │                                             ▼
      │                    viewerRegistry: first EDITOR_VIEWERS entry whose match() passes
      │                                             │
      │                                             ▼
      │                    viewer.source: "content" | "resource" | "content-and-resource" | "none"
      │                                             │
      ▼                                             ▼
DataWorkspace reads text content (readFile)  and/or resolves a URL (getFileUrl)
      │
      ▼
FilePreview ──► EditorHost ──► PuppyoneEditorHost ──► viewer.render(context)
```

## 2. Stage 1 — the format registry

`vendor/shared-ui/src/core/fileFormats.json` is the canonical registry.
Each entry is a `FileFormat` (typed in `fileFormats.ts`):

| Field | Meaning |
| --- | --- |
| `id`, `label` | Stable identifier and human name ("Word Document") |
| `filenames`, `filenamePatterns`, `extensions`, `mimeTypes` | Match keys; extensions include compound forms (`.tar.gz`) |
| `category` | Semantic family: `image`, `document`, `code`, `data`, … drives icons and semantic kinds |
| `defaultViewer` | The viewer id this format renders with (`office-preview`, `markdown-editor`, `pdf-preview`, …) |
| `editable` | Whether the format may be edited as text |
| `ingestStrategy` | Declarative ingestion hint (`raw`, `parse-text`, `parse-structured`, `ocr`); reserved for cloud ingestion, not read by the desktop preview path |
| `monacoLanguage` | Syntax highlighting language for code viewers |

`resolveFileFormat({ name, mimeType })` resolves in strict priority order:

1. exact filename (`dockerfile`, `.env`) —
2. compound extension (`.tar.gz` before `.gz`) —
3. simple extension —
4. filename glob pattern —
5. exact MIME type —
6. MIME class fallback (`image/*` → generic image, `text/*` → plain text) —
7. `unknownFormat`.

**Two consumers, one JSON.** The renderer uses the TypeScript
implementation in `fileFormats.ts`; the main process re-implements the
same resolution in `local-api/workspace.mjs` (it loads the same JSON via
`loadFileFormatRegistry()`), because the local API cannot import from the
renderer bundle. These two resolvers must stay behaviorally identical —
any change to the resolution order lands in both places.

Word documents in the registry today: `.doc` and `.docx` share one entry
(`id: "docx"`, category `document`, `defaultViewer: "office-preview"`).
The registry deliberately does not distinguish legacy from modern Office
formats; that distinction is a *viewer capability*, handled in stage 2/3.

## 3. Stage 2 — the viewer registry

`vendor/shared-ui/src/editor/viewerRegistry.tsx` holds the ordered
`EDITOR_VIEWERS` list. `resolveEditorViewer(document)` resolves the format
(stage 1), then returns the **first** viewer whose `match({ document,
format })` passes — order is load-bearing (e.g. `markdown` must win over
`text`). If nothing matches, the `document-placeholder` fallback renders
the `DocumentPreview` card ("Preview unavailable" + name/MIME metadata).

Each viewer declares its `source` requirement, which stage 3 uses to
decide what to load:

| `source` | Meaning | Examples |
| --- | --- | --- |
| `content` | Needs the file text | markdown, json, csv, code/text |
| `resource` | Needs a streamable URL, never reads text | image, pdf, audio, video, **office** |
| `content-and-resource` | Needs both | html artifact |
| `none` | Renders from metadata alone | placeholder fallback |

The `office-preview` entry matches on `format.defaultViewer ===
"office-preview"` **or** an independent name/MIME sniff
(`isOfficeDocument`) covering `docx?`, `xlsx?`/`xlsm`/`xlsb`,
`pptx?`/`ppsx?`, and the OpenDocument family — so Office files still route
correctly when only a MIME type is known.

## 4. Stage 3 — the source pipeline

`DataWorkspace.tsx` asks `getEditorSourceRequirement()` for the selected
file and loads only what the viewer needs:

- **Text content** (`dataPort.readFile`): local files go through
  `readWorkspaceTextFile` in `local-api/workspace.mjs` — capped at
  `MAX_EDITOR_BYTES` (1 MB), and a NUL byte marks the file binary
  (`content: null`). Office files never take this path (`source:
  "resource"`), so their preview has its own 25 MiB streamed input cap,
  not the editor cap.
- **Resource URL** (`dataPort.getFileUrl`): local files are served over
  the `puppyone-local://` protocol (registered in
  `electron/main/local-file-protocol.mjs`), which validates the workspace
  root, reads at most `MAX_LOCAL_FILE_BYTES` (100 MB), supports single
  byte ranges with 206/416 responses, and sets `Content-Type` from the
  registry via `getMimeType`. Cloud files resolve to a signed URL from
  the cloud API (`src/lib/cloudDataPort.ts`). Office preview first probes
  a local resource with a one-byte range, then streams the response while
  enforcing its 25 MiB cap even when `Content-Length` is absent or
  inaccurate.

The render chain is `FilePreview` → `EditorHost` (adapts a `DataNode` +
loaded content into an `EditorDocument`) → `PuppyoneEditorHost` (resolves
the viewer, computes editability, renders). Selection/commit lifecycle
rules for this chain live in
[Smooth Preview Transitions](smooth-preview-transitions.md).

## 5. Office document preview — current contract

`OfficeViewer.tsx` dispatches on the file extension and keeps Office
parsers out of the startup bundle with dynamic `import()`. Resource
loading is abortable and capped at 25 MiB while the response is streamed;
local files are range-probed before a full read. ZIP-based packages pass
a central-directory preflight before a parser is invoked.

| Format | Preview | Parser | Fidelity |
| --- | --- | --- | --- |
| `.docx` | Paginated HTML/CSS pages in a shadow root | `docx-preview` | Authored page breaks, page geometry, headers/footers, footnotes/endnotes, tables, images, fonts, and document styling; HTML alt-chunks disabled |
| `.doc` `.rtf` (local macOS) | Native conversion to `.docx`, then the same Word surface | bounded `textutil` subprocess + `docx-preview` | One Word rendering path; conversion has workspace authorization, input/output limits, timeout, and temporary-file cleanup |
| `.doc` `.rtf` (cloud or conversion failure) | Honest unsupported state + external-open when available | — | Cloud has no native conversion capability |
| `.xlsx` `.xls` `.xlsm` `.xlsb` | Virtualized grid with sheet tabs | SheetJS CE 0.20.3 in a dedicated worker | Up to 12 visible sheets × the first 5,000 source rows × 36 visible columns; formatted values, formulas/cached values, merged cells, and column widths; hidden content omitted and reported |
| `.pptx` `.ppsx` | Visual slide list | `@aiden0z/pptx-renderer` | Shapes, text, media, tables, and themes where supported; lazy/windowed rendering; JSZip text cards remain the error fallback |
| `.ppt` `.pps` | Honest unsupported state + external-open | — | Legacy binary PowerPoint is not parsed or converted |
| `.ods` `.ots` | The same spreadsheet worker/grid | SheetJS CE | Same spreadsheet budgets and visible truncation notes |
| `.odt` `.odp` `.ott` `.otp` | Plain text lines | JSZip `content.xml` extraction | Text only, capped at 400 lines |
| `.pages` `.numbers` `.key` `.epub` | Placeholder card | — | Deliberate Tier 3 support; they do not reach `OfficeViewer` |

The package preflight rejects malformed/multi-disk/ZIP64 packages,
encryption, unsafe or duplicate paths, unsupported compression methods,
more than 4,096 entries, a single declared expansion above 64 MiB, total
declared expansion above 256 MiB, or compression ratios above 100:1.
OOXML packages must also contain their required package markers; ODS has
its stricter marker checks inside the spreadsheet worker. This is a
metadata gate, not an inflater sandbox; the residual runtime-resource
limit is listed in Part 2.

`docx-preview` renders into a detached fragment. Before that fragment is
attached, `sanitizeDocxDom()` removes active elements, event handlers,
network-capable resource URLs, unsafe CSS, and other non-allowlisted
attributes. External hyperlinks are converted to inert markers and open
only through the host's controlled external-navigation capability after
a user gesture. The sanitized result is then attached to a shadow root
for style isolation.

These are read-only previews, not Office editors. The escape hatch for
unsupported formats, fidelity gaps, and large files is the external-app
surface: `electron/main/external-apps/inventory.mjs` scans installed
macOS apps and ranks candidates per extension, while the titlebar and
Office empty/error states expose the open-externally action when the
desktop capability exists.

## 6. Required formats and per-format support bar

This section is the product commitment: which formats the app must
support, at which tier, and what "supported" means for each. It is the
acceptance reference for Part 2 — every "Bar" bullet is individually
checkable, and deliberate fidelity limits stay visible instead of being
mistaken for defects.

Tiers:

- **Tier 1 — edit-grade.** Open, render, edit, and save. The app is a
  first-class editor for these.
- **Tier 2 — preview-grade.** A faithful read-only preview. Editing is
  out of scope; the external-app surface covers it.
- **Tier 3 — placeholder-grade.** No preview is planned. The bar is an
  honest placeholder card (name + type metadata) plus the external-open
  escape hatch. A placeholder is a valid, deliberate support level — the
  failure mode to avoid is a broken or misleading viewer, never the
  placeholder itself.

Cross-cutting bars that apply to **every** viewer:

- Three explicit states — loading, error, empty — before content renders
  (the `ResourcePreviewState` pattern). No blank panes, no browser-white
  flashes (see [Smooth Preview Transitions](smooth-preview-transitions.md)).
- `resource` viewers never trigger a text read (stage 3 contract).
- Whenever a preview truncates (rows, columns, sheets, lines), the
  truncation must be stated in the UI, never silent.
- Heavy parsers (docx-preview, SheetJS, pptx-renderer, JSZip, mermaid)
  load via dynamic `import()` only.
- An unsupported state always names the reason and, on desktop, offers
  the external-open action.

### Tier 1 — edit-grade

**Markdown** (`.md`, `.markdown`, `.mdx`)

- Bar: Typora-class live preview editing with source mode, per the
  dedicated contract in
  [Markdown Live Preview Editing UX](markdown-live-preview-ux.md);
  byte-perfect round-trip; wiki links + backlinks; relative asset URLs
  resolved through the data port; manual and autosave modes; AI-edit
  review decorations.
- Status: met (governed by its own document).

**Plain text and code** (`.txt`, `.log`, config files, all registered
source-code extensions)

- Bar: CodeMirror editing surface with syntax highlighting driven by the
  registry's `monacoLanguage`; editable when the file is text (no NUL
  byte) and under the 1 MB editor cap; over-cap and binary files get an
  honest state with the external-open action, not a truncated buffer.
- Status: met, except the over-cap state currently surfaces as a raw
  read error rather than a designed state (remaining in Part 2 §9).

**JSON / JSONL** (`.json`, `.jsonl`, `.json5`, `.jsonc`, `.puppyflow`)

- Bar: pretty-printed on open (`normalizeContent`); full edit + save;
  invalid JSON must still open as raw text without crashing.
- Status: met.

**CSV / TSV** (`.csv`, `.tsv`)

- Bar: table editor by default with in-cell editing and a source-mode
  toggle; delimiter inferred from the format; must stay responsive on
  large files (target: 10k rows) or truncate with a visible note.
- Status: met for typical files; 10k-row behavior remains unverified
  (Part 2 §9).

### Tier 2 — preview-grade

**HTML** (`.html`, `.htm`, and template variants)

- Bar: sandboxed preview with a source/preview toggle; `safe` trust mode
  by default, `localTrusted` only for local workspace files; document
  scripts never execute in the app's own context.
- Status: met.

**Images** (`.png`, `.jpg`, `.gif`, `.webp`, `.avif`, `.apng`, `.bmp`,
`.ico`, `.svg`)

- Bar: rendered via `<img>` from the resource URL — never read as text;
  SVG renders through `<img>` only, so embedded scripts cannot execute;
  formats Chromium cannot decode (`.heic`, `.heif`, camera RAW) must
  route to the placeholder card, not a broken `<img>`.
- Status: met for web-decodable formats; HEIC/RAW routing unverified
  (Part 2 §9). Optional enhancement: a bounded macOS `sips` conversion
  bridge following the same authorization pattern as `textutil`.

**PDF** (`.pdf`)

- Bar: Chromium's built-in PDF viewer in an iframe; local files are
  re-wrapped as blob URLs (the custom protocol cannot feed the PDF
  plugin directly); loading/error states per the cross-cutting bar.
- Status: met.

**Audio / Video** (registry audio/video families)

- Bar: native `<audio>`/`<video>` elements with `preload="metadata"`;
  codec coverage is whatever Chromium decodes — formats it cannot play
  fall back to the media element's error state; seeking/scrubbing must
  work for large local files, which requires the `puppyone-local://`
  handler to honor single `Range` requests with 206 responses and reject
  unsatisfiable ranges with 416.
- Status: met, including local 206/416 Range handling and integration
  coverage.

**Word — `.docx`**

- Bar: layout-faithful preview via `docx-preview` (Apache-2.0; renders
  OOXML directly to HTML/CSS): page geometry and margins, pagination at
  Word-written break points, headers/footers, footnotes/endnotes,
  embedded fonts, alignment/colors, tables, inline images. Rendered into
  an isolated shadow-root container so document styles cannot leak into
  app CSS (an iframe sandbox is a plugin-host concern, not needed for
  first-party rendering); `renderAltChunks` disabled (embedded HTML
  chunks are the injection surface). The OOXML central directory is
  preflighted before parsing, and the detached output DOM/CSS is
  sanitized before it is attached. Render failure falls back to the
  unsupported state with the external-open action.
- Accepted fidelity limits (inherent to HTML-based rendering, state them
  in the doc, not the UI): no live reflow pagination for documents
  without `lastRenderedPageBreak` points; TOC/field codes, SmartArt,
  and floating text boxes render approximately.
- Rationale: mammoth (the previous renderer) was a *semantic extractor*
  by design — it deliberately discards fonts, colors, alignment, page
  layout, and headers/footers. Higher-fidelity engines (SuperDoc-class
  OOXML editors, LibreOffice headless) cost AGPL licensing or a +300 MB
  bundle; `docx-preview` is ~73 KB minified and its only dependency
  (jszip) is already bundled.
- Status: met. `docx-preview` is loaded dynamically and renders in a
  shadow root with alt-chunks disabled, sanitized detached output,
  controlled hyperlinks, package preflight, abortable/capped input, and
  an external-open error fallback.

**Word — `.doc` (legacy)**

- Bar (desktop): normalized into the `.docx` pipeline — the macOS
  `textutil -convert docx` bridge converts `.doc` to `.docx`, which then
  renders through the same `docx-preview` surface. One renderer, one
  fidelity story.
- Bar (cloud, or conversion failure): honest unsupported state with the
  external-open action.
- Status: met on local macOS: the converter is workspace-authorized and
  has a 25 MiB input/output cap, an 8-second timeout, bounded process
  output, and guaranteed temporary-directory cleanup. Cloud and
  conversion failure deliberately remain unsupported with honest copy.

**Excel — `.xlsx`, `.xls`, `.xlsm`, `.xlsb`**

- Bar: SheetJS grid with sheet tabs, formatted values, formulas/cached
  values, merged cells (`!merges`), real column widths (`!cols`), and
  virtualized rows. Parsing runs in a disposable Web Worker; aborting a
  selection terminates that worker. A metadata pass excludes hidden
  sheets and chooses at most 12 visible sheets before the content pass.
  Each selected sheet is capped at the first 5,000 source rows and 36
  visible columns; hidden rows inside that window are omitted. Every
  sheet/row/column truncation and hidden-content omission is stated in
  the UI.
- Security/resource bar: no VBA or HTML is requested, formulas are never
  executed or recalculated, OOXML packages pass the shared ZIP preflight,
  declared ranges must remain within Excel's row/column limits, and the
  input buffer is transferred to rather than copied into the worker.
- Accepted fidelity limits: colors, borders, fonts, charts, images,
  pivots, and macros are not rendered. Formula cells use cached values
  when present and show the formula text when no cached value exists.
  Hidden rows, columns, and sheets are omitted rather than revealed.
- Status: met for the lightweight grid contract. Tests cover supported
  workbook families, formulas, sheet/row/column budgets, hidden content,
  merged cells crossing virtual-window boundaries, and cancellation.

**PowerPoint — `.pptx`, `.ppsx`**

- Bar: high-fidelity slide rendering via `@aiden0z/pptx-renderer`
  (Apache-2.0; browser-native OOXML → HTML/SVG): shapes, text boxes,
  images, tables, charts, SmartArt, gradients, groups, embedded fonts;
  verified upstream against PowerPoint ground truth with 450+ visual
  regression cases. Loaded via dynamic `import()` like every heavy
  parser; large decks use its `lazyMedia`/`lazySlides`/windowed options.
  Render failure falls back to the unsupported state with external-open.
- Risk note (deliberate): the library is young (first published
  2026-02) but rigorously tested and actively released; as a lazy-loaded
  read-only preview with an honest fallback, the exposure is bounded.
  Keep the current text-extraction path as the fallback branch rather
  than deleting it.
- Status: met. The visual renderer uses recommended ZIP limits,
  abortable lazy media/slides, and a windowed list; the former JSZip text
  extraction remains a visible fallback when visual rendering fails.

**PowerPoint — `.ppt`, `.pps` (legacy)**

- Bar: honest unsupported state with the external-open action.
  (`textutil` cannot convert presentations, so unlike `.doc` there is no
  cheap native bridge; Tier 3 by design.)
- Status: met as a deliberate unsupported tier. The message is honest
  and the external-open action is shown when the host provides it.

**OpenDocument — `.odt`, `.ods`, `.odp` (+ templates)**

- Bar: `.ods` through the SheetJS grid; `.odt`/`.odp` as extracted text
  lines (max 400) with the text-only limit stated; failures fall back to
  the unsupported state.
- Status: met.

**RTF — `.rtf`**

- Bar: convert to `.docx` through the bounded macOS `textutil` bridge and
  render through the same preflighted/sanitized `docx-preview` surface.
  Cloud and conversion failure use the honest unsupported state.
- Status: met on local macOS; the registry now routes `.rtf` to
  `office-preview`. Cloud conversion remains unavailable by design.

### Tier 3 — placeholder-grade

**Archives** (`.zip`, `.tar`, `.gz`, `.7z`, `.rar`, …), **iWork**
(`.pages`, `.numbers`, `.key`), **eBooks** (`.epub`, `.mobi`, `.azw`),
**unknown binary**

- Bar: the `DocumentPreview` placeholder card showing file name and
  type/MIME metadata; external-open action available; no parsing, no
  fake preview. Optional future enhancement for `.zip`: entry listing
  via the already-bundled JSZip — explicitly not required.
- Status: met.

## 7. Invariants

- `fileFormats.json` is the only place extensions and MIME types are
  declared. No viewer, icon, or service hard-codes its own extension list
  — the one sanctioned exception is `isOfficeDocument` in the viewer
  registry (a MIME/name sniff for routing) and the parser dispatch inside
  `OfficeViewer`, which is a capability statement, not format detection.
- The two registry resolvers (shared-ui TS, local-api mjs) stay
  behaviorally identical.
- `EDITOR_VIEWERS` order is part of the contract; new entries are placed
  deliberately, and the fallback stays last.
- A viewer's `source` declaration is honored: `resource` viewers must
  never trigger a text read (binary files through the text path would be
  wasted I/O and a 1 MB cap they shouldn't inherit).
- Browser Office parsing/rendering happens from a capped, abortable
  buffer. Spreadsheet parsing is isolated in a disposable Web Worker;
  Word and PowerPoint DOM rendering remain in the renderer. The main
  process does not interpret Office DOM or workbook content; its only
  format-specific operation is the authorized, bounded macOS `textutil`
  conversion for local `.doc`/`.rtf` files.
- ZIP-based Office inputs pass a metadata preflight before any archive
  parser is invoked. `docx-preview` output is built detached, sanitized,
  and only then attached to its shadow root; document-controlled external
  URLs never become live DOM navigation/resource attributes.
- An Office preview never buffers more than 25 MiB in the renderer.
  Declared length is checked when available, local resources are probed
  with Range, and the stream is counted independently of response
  headers.
- Unsupported is a first-class state: a format with no viable preview
  must say so honestly and point at the external-open escape hatch — not
  render a broken approximation.
- **Plugin-readiness disciplines** (rationale and target architecture in
  [Viewer Plugin Architecture](viewer-plugin-architecture.md); viewers
  are written as plugins that happen to ship in the box):
  - Viewers depend only on the `viewerTypes` contract — never on app
    internals.
  - Heavy parsers load via dynamic `import()` only; adding a format must
    not add startup weight.
  - Document-controlled render surfaces (Office HTML, HTML preview) live
    in isolated containers (iframe / shadow root) with a minimal explicit
    bridge.

---

# Part 2 — Implementation record and remaining limitations

Part 2 records what shipped against the Part 1 support bars and keeps the
remaining constraints explicit. Checked items describe the current tree;
they are not future promises.

## 8. Completed and archived

**Office routing and user experience**

- [x] Unsupported and failed previews explain the limitation and expose
      “Open in default app” whenever the desktop host provides that
      capability. Legacy `.ppt`/`.pps` stays deliberately unsupported.
- [x] `.docx` renders through dynamically imported `docx-preview` in a
      shadow root. Alt-chunks are disabled; authored page breaks,
      headers/footers, notes, images, fonts, and page geometry are enabled.
- [x] DOCX output is rendered into a detached fragment, sanitized, and
      only then attached. External links become inert markers and require
      a user gesture through the controlled external-navigation callback.
- [x] Local macOS `.doc` and `.rtf` use the same Word renderer after a
      workspace-authorized `textutil` conversion. The bridge has a 25 MiB
      input/output cap, timeout, bounded process output, and guaranteed
      temporary-directory cleanup.
- [x] `.rtf` now routes to `office-preview`. Cloud workspaces and native
      conversion failures use the honest unsupported state.

**Input and package containment**

- [x] Office resources use an abortable streaming reader with a hard
      25 MiB buffered-byte limit. Declared length is checked when present;
      local files are one-byte range-probed before a full request.
- [x] ZIP-based Office/OpenDocument inputs receive a central-directory
      preflight before parser dispatch. The default policy rejects unsafe
      paths, duplicates, encryption, ZIP64/multi-disk input, unsupported
      methods/flags, more than 4,096 entries, declared single-entry
      expansion above 64 MiB, declared total expansion above 256 MiB, and
      per-entry or overall ratios above 100:1.
- [x] OOXML package markers are required before Word, Excel, or PowerPoint
      rendering; ODS performs its stricter marker checks in the worker.
- [x] The local protocol implements single-range byte semantics, including
      206 responses and 416 responses for unsatisfiable ranges. Media
      seeking and Office size probes share that path.

**Spreadsheet and presentation fidelity**

- [x] SheetJS Community Edition 0.20.3 parses spreadsheets in a dedicated,
      disposable Web Worker. Input is transferred, not cloned; aborting
      terminates the worker.
- [x] Spreadsheet metadata selection limits work to 12 visible sheets.
      Each selected sheet reads at most the first 5,000 source rows and 36
      visible columns; hidden sheets/rows/columns are omitted and counted.
- [x] The virtualized grid renders formatted values, formula/cached-value
      fallbacks, column widths, and merged cells, including merges crossing
      a virtual-window boundary. Every truncation or omission is visible.
- [x] `.pptx`/`.ppsx` use `@aiden0z/pptx-renderer` with lazy media/slides,
      abort support, recommended ZIP limits, and a windowed slide list.
      The old JSZip text-card renderer remains the visible error fallback.

**Build, tests, and release hygiene**

- [x] Heavy renderer libraries remain dynamic imports and renderer-only
      packages are `devDependencies`; the build runs a lazy-chunk/entry
      bundle-budget gate.
- [x] Automated coverage includes package preflight, DOCX DOM sanitizing,
      spreadsheet families/budgets/hidden content/merges/cancellation,
      text conversion authorization, and local Range behavior.
- [x] `NOTICE` identifies `docx-preview`, SheetJS Community Edition, and
      JSZip with their selected licenses. Electron Builder explicitly
      includes `LICENSE` and `NOTICE` in packaged applications.

## 9. Remaining engineering follow-ups

These are the unresolved items. They do not negate the completed metadata
and DOM gates above.

- [ ] Add measured decompression, CPU, and memory budgets around each
      inflater/parser. Central-directory limits use archive-declared
      metadata; they cannot by themselves prove the actual work or output
      produced by a malicious stream.
- [ ] Add a rendered-page/DOM-node budget for DOCX. A 25 MiB compressed
      input can still produce a very large page tree and block the renderer
      because `docx-preview` must build DOM on the renderer thread.
- [ ] Move or bound the remaining JSZip text extraction paths
      (`.odt`/`.odp` and the PPTX text fallback). They currently run in the
      renderer rather than a disposable worker.
- [ ] Decide whether cloud `.doc`/`.rtf` deserves a server conversion
      service. Today it is intentionally unsupported, and cloud hosts do
      not necessarily provide the desktop external-open capability.
- [ ] Add low-cardinality telemetry for size/package rejection, parser
      failure, fallback use, and truncation so limits can be tuned from
      evidence without logging document names or contents.
- [ ] Finish the non-Office §6 sweep: design the over-cap text-file state,
      verify HEIC/RAW placeholder routing, load-test the CSV editor at
      10,000 rows, and audit every viewer's loading/error/empty states.

## 10. Accepted product limitations

- Word preview is HTML-based: pagination without authored break hints,
  TOC/field codes, SmartArt, floating text boxes, and exact Word reflow
  remain approximate. Password-protected/encrypted Office files are not
  previewed.
- The spreadsheet grid does not render cell fonts/colors/borders, charts,
  images, pivots, or macros. It never executes VBA or recalculates formulas;
  cached formula values are used when present. Hidden content is omitted.
- Only the first 12 visible sheets, first 5,000 source rows per selected
  sheet, and first 36 visible columns are previewed. The UI states every
  truncation and hidden-content omission.
- Legacy `.ppt`/`.pps` has no built-in conversion. PPTX rendering may fall
  back to extracted text when the visual renderer rejects a deck.
- `.odt`/`.odp` preview is extracted text only and stops at 400 lines.
  `.ods`/`.ots` inherits the spreadsheet grid's budgets and fidelity.
- Office input above 25 MiB is rejected from in-app preview. Desktop users
  can open it externally; cloud behavior depends on host capabilities.

## 11. Verification

Fast automated verification:

```bash
npm test
npx tsc --noEmit
npm run check:boundaries
```

Release verification (also exercises the bundle-budget gate):

```bash
npm run build
npm run dist:mac
```

Manual fixtures should include: a styled multi-page DOCX with local images,
headers/footers and external/internal links; malicious DOCX CSS/URLs; a
legacy DOC and RTF; oversized and malformed/encrypted/ZIP-bomb-shaped
packages; XLS/XLSX/XLSM/XLSB/ODS workbooks with formulas, hidden content,
wide ranges, merges crossing the virtual window, and more than 12 sheets;
a visual PPTX plus a corrupt deck that takes the text fallback; a legacy
PPT; and a large local video scrubbed across multiple byte ranges.
