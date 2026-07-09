# File Format and Viewer Pipeline

This document has two parts with different lifetimes:

- **Part 1 — Architecture specification.** The durable contract for how a
  file name/MIME type becomes a rendered preview: the format registry, the
  viewer registry, the content/resource source pipeline, the Office
  document preview matrix, and the per-format support bar (§6) every
  required format must meet. It remains the reference for everyone adding
  a file format or viewer after the current work is done.
- **Part 2 — Remediation plan.** The to-do list and code change map for
  closing the gaps against the §6 support bar — chiefly Word document
  support (`.doc` has no preview at all; `.docx` renders through mammoth,
  a semantic extractor that discards layout by design and is replaced by
  `docx-preview`; the unsupported-format copy points at a bridge that
  does not exist), plus a cross-format compliance sweep. It is scoped to
  this one round of work; delete or archive it once the fixes have
  shipped and stabilized.

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
  "resource"`), so their size cap is the resource cap, not the editor cap.
- **Resource URL** (`dataPort.getFileUrl`): local files are served over
  the `puppyone-local://` protocol (registered in
  `electron/main/local-file-protocol.mjs`), which validates the workspace
  root, reads at most `MAX_LOCAL_FILE_BYTES` (100 MB), and sets
  `Content-Type` from the registry via `getMimeType`. Cloud files resolve
  to a signed URL from the cloud API (`src/lib/cloudDataPort.ts`).

The render chain is `FilePreview` → `EditorHost` (adapts a `DataNode` +
loaded content into an `EditorDocument`) → `PuppyoneEditorHost` (resolves
the viewer, computes editability, renders). Selection/commit lifecycle
rules for this chain live in
[Smooth Preview Transitions](smooth-preview-transitions.md).

## 5. Office document preview — current contract

`OfficeViewer.tsx` fetches the resource URL into an `ArrayBuffer` and
dispatches on the file extension. All parsers are dynamic `import()`s so
mammoth/SheetJS/JSZip never enter the main bundle.

| Format | Preview | Parser | Fidelity |
| --- | --- | --- | --- |
| `.docx` | HTML document render | mammoth (`convertToHtml`, images as data URIs) | Text, headings, lists, tables, inline images. No pagination, headers/footers, columns, or exact layout |
| `.doc` | **None** — "unsupported" message | — | Legacy binary Word is not parsed at all |
| `.xlsx` `.xls` `.xlsm` `.xlsb` | Sheet grid with tabs | SheetJS | Values only (no formatting); capped at 12 sheets × 250 rows × 36 columns, truncation noted |
| `.pptx` `.ppsx` | Slide text cards | JSZip + XML text extraction | Slide titles and text lines only — no layout, images, or theming |
| `.ppt` `.pps` | **None** — "unsupported" message | — | Legacy binary PowerPoint is not parsed |
| `.odt` `.ods` `.odp` (+templates) | Plain text lines | JSZip `content.xml` text extraction (max 400 lines); `.ods` tries SheetJS first | Text only |
| `.rtf`, `.pages`, `.numbers`, `.key`, `.epub` | Placeholder card | — | Registered in the registry as `binary-placeholder`; never reach OfficeViewer |

This is by design a **lightweight preview**, not an editor and not a
high-fidelity renderer. The escape hatch for real fidelity is the
external-app surface: `electron/main/external-apps/inventory.mjs` scans
installed macOS apps and ranks candidates per extension (with UTI hints
for `doc`/`docx`), and the titlebar "open externally" control launches
the file in Word/Pages/etc. Preview and escape hatch together are the
product answer for Office files.

## 6. Required formats and per-format support bar

This section is the product commitment: which formats the app must
support, at which tier, and what "supported" means for each. It is the
implementation target for Part 2 — every "Bar" bullet is meant to be
individually checkable.

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
  read error rather than a designed state (Phase 6).

**JSON / JSONL** (`.json`, `.jsonl`, `.json5`, `.jsonc`, `.puppyflow`)

- Bar: pretty-printed on open (`normalizeContent`); full edit + save;
  invalid JSON must still open as raw text without crashing.
- Status: met.

**CSV / TSV** (`.csv`, `.tsv`)

- Bar: table editor by default with in-cell editing and a source-mode
  toggle; delimiter inferred from the format; must stay responsive on
  large files (target: 10k rows) or truncate with a visible note.
- Status: met for typical files; large-file behavior unverified
  (Phase 6).

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
  (Phase 6). Optional enhancement: macOS `sips` conversion bridge for
  HEIC, same shape as the Phase 3 `textutil` bridge.

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
  handler to honor `Range` requests with 206 responses (it currently
  advertises `Accept-Ranges: bytes` but returns whole bodies).
- Status: playback met; Range handling is a gap (Phase 6).

**Word — `.docx`**

- Bar: layout-faithful preview via `docx-preview` (Apache-2.0; renders
  OOXML directly to HTML/CSS): page geometry and margins, pagination at
  Word-written break points, headers/footers, footnotes/endnotes,
  embedded fonts, alignment/colors, tables, inline images. Rendered into
  an isolated shadow-root container so document styles cannot leak into
  app CSS (an iframe sandbox is a plugin-host concern, not needed for
  first-party rendering); `renderAltChunks` disabled (embedded HTML
  chunks are the injection surface). Render failure falls back to the
  unsupported state with the external-open action.
- Accepted fidelity limits (inherent to HTML-based rendering, state them
  in the doc, not the UI): no live reflow pagination for documents
  without `lastRenderedPageBreak` points; TOC/field codes, SmartArt,
  and floating text boxes render approximately.
- Rationale: mammoth (the previous renderer) is a *semantic extractor*
  by design — it deliberately discards fonts, colors, alignment, page
  layout, and headers/footers. Higher-fidelity engines (SuperDoc-class
  OOXML editors, LibreOffice headless) cost AGPL licensing or a +300 MB
  bundle; `docx-preview` is ~73 KB minified and its only dependency
  (jszip) is already bundled.
- Status: gap — current preview is mammoth semantic HTML (Phase 2).

**Word — `.doc` (legacy)**

- Bar (desktop): normalized into the `.docx` pipeline — the macOS
  `textutil -convert docx` bridge converts `.doc` to `.docx`, which then
  renders through the same `docx-preview` surface. One renderer, one
  fidelity story.
- Bar (cloud, or conversion failure): honest unsupported state with the
  external-open action.
- Status: gap — no preview at all today (Phases 1 and 3).

**Excel — `.xlsx`, `.xls`, `.xlsm`, `.xlsb`**

- Bar: SheetJS grid with sheet tabs, upgraded to everything the parser
  already provides: merged cells (`!merges`), real column widths
  (`!cols`), formatted cell values; virtualized rows so large sheets
  render smoothly with a raised cap and a visible truncation note.
  SheetJS stays — its parse breadth (`.xls`/`.xlsb`/`.ods`) is the
  reason to keep it.
- Accepted fidelity limit (state in the doc, not the UI): cell *styling*
  — colors, borders, fonts — is not rendered. SheetJS Community Edition
  does not parse styles (a Pro paywall feature), and the open-source
  alternative that does (exceljs) is widely considered unmaintained.
  Values, merges, and geometry are the honest ceiling for a lightweight
  open-source preview.
- Status: partial — merges/column widths are dropped today and the row
  cap is a hard cut, below what the community parser gives us for free
  (Phase 7).

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
- Status: gap — current preview is text-only slide cards (Phase 8).

**PowerPoint — `.ppt`, `.pps` (legacy)**

- Bar: honest unsupported state with the external-open action.
  (`textutil` cannot convert presentations, so unlike `.doc` there is no
  cheap native bridge; Tier 3 by design.)
- Status: message exists but names a nonexistent bridge and offers no
  action (Phase 1).

**OpenDocument — `.odt`, `.ods`, `.odp` (+ templates)**

- Bar: `.ods` through the SheetJS grid; `.odt`/`.odp` as extracted text
  lines (max 400) with the text-only limit stated; failures fall back to
  the unsupported state.
- Status: met.

**RTF — `.rtf`** (target tier; currently Tier 3)

- Bar: once the Phase 3 `textutil` bridge exists, convert to `.docx` on
  desktop and render through the same `docx-preview` surface; registry
  entry flips to `office-preview` at that point.
- Status: placeholder today (Phase 5).

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
- Office parsing happens in the renderer from a fetched buffer; the main
  process never parses documents.
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

# Part 2 — Remediation plan (current work)

Scope: close the gaps between the current implementation and the Part 1
§6 support bars — primarily Word/Office document support, plus the
cross-format items Phase 6 collects. No engine change: the registry →
viewer → source pipeline stays exactly as specified in Part 1.

## 8. Known gaps

1. **`.doc` / `.ppt` / `.pps` have no preview.** `OfficeViewer` returns an
   unsupported message. Worse, the copy says "Legacy .doc files need the
   native Office format bridge" — **no such bridge exists in this
   codebase**. The message names internal machinery that was never built,
   and offers the user no action.
2. **The unsupported state has no escape-hatch action.** The external-app
   open surface exists (titlebar), but the unsupported preview card does
   not link to it.
3. **The `.docx` renderer is a fidelity ceiling.** mammoth is a semantic
   extractor by design: fonts, colors, alignment, page geometry,
   headers/footers, and pagination are discarded no matter how much work
   is layered on top. Its conversion warnings are also collected and
   dropped (`parseWordDocument` returns `warnings` that no UI renders).
   The fix is replacing the renderer (§6 Word bar), not patching mammoth.
4. **Whole-file parse on the renderer main thread.** The resource fetch
   buffers up to 100 MB and mammoth/SheetJS parse synchronously; a large
   workbook freezes the UI. There is no office-specific size guard.
5. **mammoth HTML is injected unsanitized.** The word preview renders via
   `dangerouslySetInnerHTML`. mammoth generates markup rather than
   passing raw document HTML through, so exposure is low — but a
   sanitization pass (or an allowlist post-filter) is cheap defense in
   depth for a file that may come from anywhere.
6. **`.rtf` renders as a bare placeholder** even though it is a text-based
   format that macOS can convert natively (`textutil`).
7. **Media seeking may not work on large local files.** The
   `puppyone-local://` handler advertises `Accept-Ranges: bytes` but
   ignores `Range` request headers and always returns the whole body.
8. **Edge states below the §6 cross-format bar.** Over-cap (>1 MB) text
   files surface a raw error string instead of a designed state with an
   external-open action; HEIC/RAW images may hit a broken `<img>` instead
   of the placeholder; CSV behavior on very large files is unverified.
9. **The Excel grid renders below what SheetJS already parses.** Merged
   cells (`!merges`) and column widths (`!cols`) are available from the
   community parser and are dropped on the floor; the 250-row cap is a
   hard cut with no virtualization.
10. **The `.pptx` preview is text-only while a real renderer now
    exists.** The text-card approach predates `@aiden0z/pptx-renderer`;
    slides with shapes, images, tables, and charts reduce to bullet
    lines today.

## 9. To-do list

Phases in dependency order; each lands independently.

**Phase 1 — honest unsupported state (small, ship first)**

- [ ] Rewrite the unsupported copy: state plainly that legacy binary
      Office formats have no built-in preview and that `.docx`/`.pptx`
      save-as re-export or an external app are the paths forward. Remove
      the reference to the nonexistent "native Office format bridge".
- [ ] Add an "Open in default app" action to `OfficeEmptyState`. Plumbing:
      add an optional `onOpenExternal?: () => Promise<void>` capability to
      `EditorViewerContext`, threaded from the desktop app (the existing
      `useActiveExternalOpenTarget` flow) through `FilePreview` →
      `EditorHost` → `PuppyoneEditorHost`. Cloud workspaces simply don't
      provide it, and the button hides when the capability is absent.
      (This is deliberately the same shape as `openExternal()` in the
      future plugin host API — see
      [Viewer Plugin Architecture §3](viewer-plugin-architecture.md).)

**Phase 2 — replace the `.docx` renderer with `docx-preview`**

- [ ] Add the `docx-preview` dependency (Apache-2.0; jszip peer is
      already bundled). Load it via dynamic `import()` only, like the
      other office parsers.
- [ ] Rewrite the word branch of `OfficeViewer`: render the fetched
      buffer with `renderAsync` into a **shadow root** (attach one to the
      preview container; pass it as both `bodyContainer` and
      `styleContainer`). The need here is CSS isolation — document
      styles/fonts must not leak into app CSS and vice versa — and
      shadow DOM delivers that without an iframe's height/scroll/bridge
      overhead. A sandboxed iframe is *not* required for this phase: that
      is the security boundary for third-party code, which belongs to the
      future plugin host (see
      [Viewer Plugin Architecture §3](viewer-plugin-architecture.md));
      docx-preview is first-party code rendering inert markup. Options:
      `renderAltChunks: false` (embedded HTML chunks are the one
      injection surface), `ignoreLastRenderedPageBreak: false` (honor
      Word-written page breaks), headers/footers/footnotes on.
- [ ] Scale the rendered page to fit the preview pane width (the library
      renders at true page size).
- [ ] On render failure, fall back to the Phase 1 unsupported state —
      not a blank pane. Very long documents render every page into the
      DOM; rely on the Phase 4 size guard, and if a many-page document
      still stalls, cap rendered pages with a visible note (same
      truncation pattern as the spreadsheet grid).
- [ ] Verify image and embedded-font rendering end to end: docx-preview
      emits `blob:`/`data:` URLs for them. The renderer currently ships
      no CSP (`index.html` has none), so this should just work — if a CSP
      is ever added, it must allow `img-src blob: data:` and
      `font-src blob: data:` or docx images/fonts silently disappear.
- [ ] Remove the mammoth dependency and the warnings plumbing once the
      new branch ships (`package.json`, `parseWordDocument`).

**Phase 3 — legacy `.doc` conversion bridge (macOS)**

The actual "bridge" the old copy gestured at. macOS ships `textutil`,
which converts `.doc` to `.docx` without any Office install — after
which the Phase 2 renderer takes over. One renderer, one fidelity story.

- [ ] Main-process helper (`local-api` or `electron/main`): run
      `textutil -convert docx <file> -output <tmp>` with a timeout and
      size cap, return the converted bytes, delete the temp file; expose
      over IPC gated to open workspace roots, mirroring the
      `puppyone-local://` root checks.
- [ ] `OfficeViewer`: for `.doc` on desktop, request the converted
      buffer and render it through the Phase 2 `docx-preview` branch;
      keep the Phase 1 unsupported state as the fallback when conversion
      fails or in cloud workspaces.

**Phase 4 — hardening and large files**

- [ ] Add an office-preview size guard (e.g. decline above ~25 MB with the
      unsupported/escape-hatch state) before fetching the full buffer.
- [ ] Verify the isolation container blocks remote resource loads from
      document content (external image relationships); document images
      must come only from the archive (blob/base64 URLs).
- [ ] Optional: move SheetJS/docx parsing into a Web Worker if size
      telemetry shows real-world freezes; not blocking. (`docx-preview`
      renders DOM and cannot fully move off-thread; its parse phase can.)

**Phase 5 — `.rtf` preview (optional, after Phase 3)**

- [ ] Route `.rtf` through the `textutil -convert docx` bridge on
      desktop; registry entry flips `defaultViewer` from
      `binary-placeholder` to `office-preview` once the bridge exists.

**Phase 6 — cross-format bar compliance (§6 sweep)**

- [ ] `puppyone-local://` handler: honor `Range` request headers with 206
      partial responses so `<video>`/`<audio>` scrubbing works on large
      files (`electron/main/local-file-protocol.mjs`; keep the
      workspace-root and size checks).
- [ ] Over-cap text files (>1 MB): replace the raw error string with a
      designed state (file name, size, reason) plus the external-open
      action.
- [ ] HEIC/HEIF and camera-RAW extensions: verify registry routing sends
      them to `binary-placeholder`, not `image-preview`; fix entries that
      produce a broken `<img>`.
- [ ] CSV: load a 10k-row file; if the table editor stalls, cap rendered
      rows with a visible truncation note (same pattern as the
      spreadsheet grid).
- [ ] Audit every viewer against the three-state (loading/error/empty)
      bar; `OfficeViewer` and `ResourcePreviewState` already comply —
      confirm CSV/JSON/text frames do too.
- [ ] Build the bundle budget gate the invariants reference:
      `scripts/check-bundle-budget.mjs`, wired into `npm run build` like
      `check:boundaries`. Assert (a) the entry chunk stays under budget
      (set it from the current ~1.9 MB baseline), and (b) no heavy parser
      (mermaid, xlsx, jszip, docx-preview) appears in the entry chunk —
      this turns the lazy-loading discipline into a build failure instead
      of a review hope.
- [ ] Packaging hygiene: move renderer-only packages (react, react-dom,
      codemirror/lezer family, lucide-react, mermaid, xlsx, jszip,
      docx-preview, xterm family) to `devDependencies` so electron-builder
      stops double-shipping them into `app.asar` (~55 MB today; Vite
      bundles them into `dist` regardless of dependency type). Keep only
      main-process runtime deps: `node-pty`, `electron-updater`,
      `electron-log`. Verify with a `dist:mac` build.

**Phase 7 — spreadsheet fidelity pass (zero new dependencies)**

Everything here uses data the community SheetJS parser already returns:

- [ ] Render merged cells: read `worksheet["!merges"]` and emit
      `colspan`/`rowspan` on the grid (skip covered cells).
- [ ] Render column widths: map `worksheet["!cols"]` (`wch`/`wpx`) to
      `<col>` widths instead of browser auto-layout.
- [ ] Virtualize rows: replace the hard 250-row cut with windowed
      rendering; raise the parse cap (e.g. 5 000 rows) and keep the
      visible truncation note for anything beyond it.
- [ ] Do **not** chase cell styling (colors/borders/fonts): SheetJS CE
      does not parse styles (Pro paywall) and exceljs is unmaintained —
      this limit is accepted in the §6 bar.

**Phase 8 — high-fidelity `.pptx` rendering**

- [ ] Add `@aiden0z/pptx-renderer` (Apache-2.0), dynamic `import()`
      only; do not enable the optional `pdfjs` EMF fallback initially.
- [ ] Replace the presentation branch of `OfficeViewer` for
      `.pptx`/`.ppsx`: render into the preview pane with
      `lazyMedia: true`, `lazySlides: true`, and windowed list options
      for large decks; scale slides to fit the pane width.
- [ ] Keep the existing JSZip text-extraction path as the fallback
      branch when the renderer throws (young library — see the §6 risk
      note); final fallback remains the unsupported state.
- [ ] `.ppt`/`.pps` stay on the Phase 1 unsupported state (no
      conversion bridge exists for legacy presentations).

## 10. Code change map

| Area | Current | Target |
| --- | --- | --- |
| Unsupported copy (`OfficeViewer.tsx`) | Names a nonexistent "bridge", no action | Honest copy + external-open action |
| `.docx` renderer | mammoth semantic HTML (layout discarded), raw `dangerouslySetInnerHTML` | `docx-preview` layout render in an isolated container, `renderAltChunks` off |
| `.doc` / legacy Word | Unsupported message only | `textutil -convert docx` on macOS desktop → `docx-preview`; unsupported fallback elsewhere |
| mammoth dependency | In `package.json`, warnings computed and dropped | Removed with Phase 2 |
| Large files | Unbounded fetch + sync parse | Size guard; worker parse as follow-up |
| `.rtf` | `binary-placeholder` | Optional `textutil -convert docx` route |
| Local protocol Range requests | Header advertised, not honored | 206 partial responses for media seeking |
| Over-cap text files | Raw error string | Designed state + external-open action |
| HEIC / RAW images | Possibly routed to broken `<img>` | Verified `binary-placeholder` routing |
| Excel grid | Values only; merges/widths dropped; hard 250-row cut | Merges + column widths + virtualized rows (SheetJS data already there) |
| `.pptx` preview | Text-only slide cards | `@aiden0z/pptx-renderer` slides; text cards demoted to fallback |

## 11. Verification

```bash
npm test
npm run build
npm run check:shared-ui
```

Manual checks: a `.docx` with images, tables, headers/footers, and
multiple pages (layout fidelity: page breaks, margins, fonts); a `.docx`
whose styles would leak (confirm isolation container); a legacy `.doc`
(converted preview on desktop, unsupported + open-externally in cloud);
a multi-sheet `.xlsx` above the row cap with merged cells and custom
column widths (merges/widths render, scrolling stays smooth); a `.pptx`
with shapes, images, tables, and charts (slides render visually; a
corrupt one falls back to text cards); corrupt files with each extension
(error state, no crash); the external-open action from the unsupported
card; scrubbing a large local video; a >1 MB text file (designed
over-cap state); a `.heic` image (placeholder, not a broken image); a
10k-row CSV.
