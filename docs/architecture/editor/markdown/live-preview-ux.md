# Markdown Live Preview Editing UX

Technical ownership, parser/model boundaries, rendering adapters, and HTML
security are defined in
[Markdown Editor Architecture](architecture.md). This document
defines the user-visible editing contract.

This document has two parts with different lifetimes:

- **Part 1 — UX specification.** The durable editing contract for the
  Markdown editor. It describes behavior only — no implementation or
  migration content — and remains the reference for everyone working on the
  editor after the current work is done.
- **Part 2 — Migration plan.** The to-do list and code change map for moving
  the implementation in `vendor/shared-ui/src/editor/markdown/` onto Part 1.
  It is scoped to this one migration; delete or archive it once the new
  behavior has shipped and stabilized.

---

# Part 1 — UX specification

## 1. Design goal

A Markdown document should read as a rendered document at all times, and
editing should feel like editing that rendered document — while the file on
disk stays plain Markdown.

The interaction model this spec rejects is **line-level source reveal**:
flipping the caret line (or any line a selection touches) into raw source.
Editors built that way (several mainstream live previews, and this editor
before this spec) all exhibit the same failures:

- Clicking into a heading just to place the caret rewraps and restyles the
  whole line (font size changes, hashes appear, text shifts horizontally).
- The caret cannot sit quietly at the start of a rendered heading; arriving
  there flips the line to `# Heading` source.
- Editing one bold word reveals every other marker on the same line.
- Vertical caret movement through a document causes continuous layout churn.

The model specified below (Typora's, with its known edges patched) never
flips a line. Source is visible in exactly two situations: the single inline
element the caret is inside, and a line whose new block syntax the user is
still typing.

## 2. Reference model: how Typora actually behaves

Verified against Typora documentation and issue tracker (see §10).

### 2.1 Inline (span) elements — reveal per element, on caret entry

> "Span elements will be parsed and rendered right after typing. Moving the
> cursor to the middle of a span element will expand that element into the
> Markdown source." — Typora Markdown Reference

- Typing `**bold**` renders the moment the closing delimiter is typed; the
  caret ends up after the element, which counts as *outside*, so delimiters
  hide immediately.
- Moving the caret *into* the element expands **only that element** into
  source (`**bold**` with dimmed delimiters). The rendered style (bold,
  italic color, code background) is kept while expanded.
- Moving the caret out collapses it again.
- Granularity is the single element. Sibling elements on the same line stay
  rendered.

### 2.2 Block markers — never revealed in place (default)

> "Markdown tags for block level styles, such as `###` or `- [x]` will be
> hidden once the block is rendered." — Typora Quick Start

- While composing a new block (`# title` before pressing Return), the line
  shows the raw marker in plain paragraph style. Issue #98 confirms: "When
  you first type a header, one can see the header level… But once you hit
  ENTER the markup is forever hidden."
- After commit, placing the caret anywhere in the heading — including the
  leftmost visible position — does **not** reveal the hashes.
- Editing the block type afterwards goes through commands (⌘1–⌘6, ⌘0 for
  paragraph, list/quote toggles) or deletion at the block start.
- A preference, "Display markdown source for simple blocks (including
  headings, etc.) on focus", opts into revealing block markup when the caret
  is inside. It is off by default, and issue #285 documents that its reveal
  drops the rendered heading style (a long-criticized inconsistency).

### 2.3 Commit semantics

Block syntax is *committed* by pressing Return, or by the caret leaving the
line (click elsewhere, arrow away, blur). Until commit, the line is honest
source text with default paragraph styling. After commit, the marker is
hidden and the block style applies.

### 2.4 Known Typora criticisms (so we choose deliberately)

- #98 / #6430: once a heading is committed there is no in-place way to see
  or edit its level; you must use shortcuts or the menu.
- #443: caret at the *end* of a formatted span still leaks source ("no way
  to click on the end of something formatted without seeing the
  formatting").
- #285 / #1317: the reveal-on-focus preference loses the rendered style for
  headings, unlike bold/italic — inconsistent WYSIWYG.

Line-reveal live previews solve #98 by revealing markers for anything the
selection touches (active line included), at the cost of exactly the
line-flipping churn this spec removes. The spec below takes Typora's model
and patches these edges instead.

## 3. Core principles

1. **Markdown text is the only document model.** What is on disk is what the
   editor buffer holds. Rendering is a pure view transform, never a data
   conversion.
2. **Rendered-first.** The default state of every element is rendered.
   Source is an exception with a precise trigger, scoped to the smallest
   possible range (one element, or one composing line). A whole line never
   flips because the caret arrived.
3. **The caret is honest.** The caret always sits at a real document
   position, is always visible, and never gets trapped inside hidden syntax.
   Hidden marker ranges are atomic: caret motion skips them as if they were
   a single invisible character glued to the element.
4. **Deletion is how you "open" hidden block syntax.** Backspace at the
   visible start of a block deletes the hidden marker prefix in one
   keystroke, demoting the block. No reveal step in between.
5. **No layout surprises.** Reveal/collapse must not change line height.
   Revealed inline elements keep their rendered style (bold stays bold while
   its `**` shows). Composing lines keep plain paragraph metrics until
   commit.
6. **Selection never reveals.** Only a collapsed caret reveals inline
   source. Range selections (mouse drags, shift-selects) act on rendered
   text without expanding anything — this kills drag flicker by
   construction.

## 4. Element lifecycle

Every markdown construct moves between these states:

| State | Meaning | Visual |
| --- | --- | --- |
| composing | Being typed; syntax not yet committed | Raw source, plain paragraph style |
| rendered | Committed; caret outside | Syntax hidden, full styling |
| revealed | Caret inside (inline elements only) | Syntax visible + dimmed, styling kept |

Commit triggers (composing → rendered):

- Return pressed on the line.
- Caret leaves the line (any means: click, arrows, search jump).
- Editor loses focus.
- Content arrives by paste / programmatic change (never composing).

Composing applies only to the **block marker prefix of the caret line while
the user is typing it**. Editing the text of an already-rendered heading
does not un-render it; only its marker area stays hidden.

## 5. Block elements

Notation: `‸` is the caret. "Visible start" means the first position after
the hidden marker prefix — the leftmost place the caret can be on that line.

### Headings (`#` … `######`)

- Composing: `# Puppy‸` shows literally, plain paragraph size. Adding or
  removing hashes live-adjusts the pending level. On commit the hashes + one
  space hide and the heading style (size/weight per level) applies.
- Rendered: caret moves through the text normally. `Home` / click at the far
  left puts the caret at the visible start. The hashes never reappear.
- Backspace at visible start: deletes the entire hidden `#… ` prefix in one
  keystroke → the line becomes a plain paragraph, text intact, caret stays
  at line start. (One keystroke, not one per hash.)
- Level editing without retyping: ⌘1–⌘6 set level, ⌘0 converts to
  paragraph. These work in rendered state — this is the patch for Typora
  criticism #98.
- Forward-delete at the end of the previous line merges the heading text up
  as source (`foo` + `# bar` → `foo# bar`, which no longer parses as a
  heading and therefore renders raw). We accept this source-honest result
  rather than Typora's rich-text merge.

### Lists (`-`, `*`, `+`, `1.`, `1)`)

- Composing: `- ‸` commits **immediately** once the marker + space + first
  content character exist (list markers are unambiguous; waiting for Return
  adds nothing). The marker renders as a bullet / number.
- Return on a non-empty item: continues the list with a new hidden marker on
  the next line (auto-continuation). Return on an empty item: removes the
  marker and exits the list.
- Backspace at visible start of an item: deletes the hidden marker (and task
  bracket if present) → text stays as a paragraph at the same indent; a
  second Backspace merges with the previous line.
- Tab / Shift-Tab at item start: indent / outdent. Ordered lists renumber on
  every change.

### Task items (`- [ ]`, `- [x]`)

- Rendered as a clickable checkbox; clicking toggles `[ ]`/`[x]` in the
  source. Visually: a crisp near-square control (~1.5px radius) with a
  solid ~1.5px stroke in plain text color (never a muted-gray mix, which
  reads muddy); checked fills with the accent and a white checkmark. The
  box-to-text gap is ~9px — the tight to-do list convention.
- Composing/commit/backspace follow list rules; Backspace at visible start
  first removes the `[ ] ` bracket (leaving a plain list item), a second
  removes the list marker.
- Checked items style their text (muted + strikethrough) but stay editable.

### Blockquote (`>`)

- Composing: `> quote‸` shows raw until commit, then the `> ` hides and the
  quote bar + muted style render. Nested `>>` produce nested bars.
- Return continues the quote; Return on an empty quote line exits it.
- Backspace at visible start removes one `> ` level per keystroke.

### Fenced code block (```` ``` ````)

- Composing: the opening fence line stays raw. Return commits and opens the
  rendered code block with the caret in the code area; the fence lines are
  never shown while rendered.
- The rendered block hosts an embedded code editing surface (language field
  + code area). Arrow-down from the document line above enters the code
  area; arrow-down at the last code line (and arrow-up at the first) exits
  to the surrounding document. Return inside inserts newlines and never
  exits.
- Fence metadata separates syntax language from source provenance. Legacy
  evidence fences such as ```` ```83:99:package.json ```` are read as
  `package.json · L83–99`, with `json` inferred from the extension; they are
  never exposed as a fake language. The code header renders the source as a
  read-only, ellipsized label and keeps the editable language independent.
  On the next real edit, the fence is normalized to a portable first language
  token plus structured metadata, for example
  ```` ```json file="package.json" lines="83-99" ````.
- The document remains the only vertical scroll owner: the code area grows
  with its newline count and never shows an inner vertical scrollbar. Long,
  unwrapped lines use one subtle horizontal scrollbar on demand.
- Backspace in an empty code block removes the whole block. Escape or caret
  exit commits edits back to the fenced source.

### Mermaid diagram (```` ```mermaid ````)

A fenced code block whose info string is `mermaid` renders as a diagram
instead of a code editing panel.

- Composing: the opening fence line stays raw like any fence. Return
  commits and renders the diagram.
- Rendered: the diagram replaces the whole block and is atomic — caret
  positions exist before and after it, never inside the source.
- Editing: clicking the diagram (or its Edit affordance) opens the in-place
  editing surface — Mermaid source on top, live diagram preview below
  (the common split-view pattern; Typora's focused fence). The preview
  re-renders as the source changes, debounced. Arrow-key entry/exit
  follows fenced code block rules; Escape or caret exit commits back to
  the fence and collapses to diagram-only.
- Errors: while editing, invalid intermediate syntax keeps the **last
  successful diagram** plus an inline error message — the diagram never
  flashes or gets replaced by an error graphic mid-typing. A block that has
  never rendered successfully shows the error message with the source.
- Read-only documents render the diagram with no edit affordance.
- The diagram follows the app theme (light/dark) and re-renders on theme
  change.

### Table (`| a | b |`)

The table renders as a grid at all times; pipe source is never shown in
live preview (whole-table source editing belongs to a source mode). Every
structural operation is a rewrite of the plain pipe-table source and undoes
as a single step.

Composing: the header row stays raw; Return commits and builds the table.
The delimiter row is generated automatically when missing.

Cell editing:

- Cells edit in place; leaving a cell commits it, Escape reverts it.
- Tab / Shift-Tab move to the next / previous cell. Tab in the **last**
  cell appends a new empty row and focuses its first cell (the
  Typora convention) instead of exiting the table.
- Return commits the cell and moves to the cell below; on the last row it
  exits below the table.
- Arrow keys at the grid's boundary rows exit into the surrounding
  document.

Structure editing — four entry points converge on one operation set
(insert row above/below, insert column left/right, move row up/down, move
column left/right, duplicate row, delete row / column / table, set column
alignment; sort-by-column is an enhancement):

- **Keyboard**: Tab at the end appends a row; ⌘Enter inserts a row below
  the current one.
- **Context menu** on any cell: the full operation set. This is the
  discoverable, complete surface. Menus mount into the host's theme-aware
  overlay root (with a resolved-token fallback for hosts without one), use
  `menu` / `menuitemradio` semantics, and provide roving focus with Arrow
  keys, Home/End, character navigation, Escape restoration, and focus-exit
  cleanup. Moving focus into a menu suspends cell blur commit so an active
  draft is neither lost nor committed merely because the menu opened.
- **Hover affordances**: "+" strips along the table's right and bottom
  edges append a column / row. The strips are subtle bars outside the
  table border that highlight on direct hover — deliberate hit areas,
  because thin edge-click affordances are a known source of accidental
  column inserts.
- **Drag handles**: exactly **one handle pair**
  exists, driven by the hovered cell — never one handle per row/column at
  once. The row handle is a small grip pill straddling the left border of
  the hovered body row; the column handle straddles the top border of the
  hovered column. The header row is fixed and gets no row handle. Handles
  disappear when the pointer leaves the table. Clicking (or
  right-clicking) a handle opens the operations menu scoped to that row
  (row items) or column (column items + alignment). Pointer-down gives the
  scoped row/column a soft accent wash immediately; a short click keeps that
  wash while the menu is open and clears it when the menu closes. Dragging a
  handle highlights the source row/column and shows an accent **drop indicator
  line** at the insertion boundary under the pointer; releasing applies
  one move operation, Escape cancels the drag.

Pointer feedback and motion: hover feedback is scoped to what the pointer
is actually over — the hovered **cell** tints and the table gets one neutral
outer ring while its structural border stays unchanged; whole rows never
highlight on mere hover (row/
column-level highlight is reserved for active handle operations — pressed,
menu-scoped, or dragging — where it marks the action source). All transient
affordances (handles, hover tints, "+"
strips) fade in and out over ~120–160 ms instead of popping; a handle that
is already visible glides to the next row/column, while a hidden one
appears in place. Menus animate open with a short fade/scale. All motion
is suppressed under `prefers-reduced-motion`.

Selection: the table has two visual layers, and they must not be confused:

- **Cell focus** (click anywhere inside a cell — text *or* empty padding):
  the focused **cell** (`td`/`th`) shows a full-cell inset ring. This is
  the primary interaction. Empty padding must never select the whole
  table; that was a hit-target bug (the contenteditable did not fill the
  row height, so padding clicks landed on `td` and were misrouted).
- **Block select** (document selection that covers the table's source
  range, e.g. drag across the table or ⌘A): the whole table shows an
  accent ring and wash. Copy yields the pipe-table source; Delete
  removes the table. Block select is *not* triggered by clicking inside
  a cell.

Native browser selection cannot paint inside a replaced widget, so without
the block-selected state a selection that covers the table gives no
feedback at all. Entering a cell clears any covering block selection so
the two chromes never compete.

Alignment: the delimiter row's `:---:` markers drive per-column text
alignment in the rendered grid; the context menu sets left / center /
right per column.

Focus continuity: a structural operation keeps the user in the table.
After the edit, the same logical cell — or the natural target, e.g. the
first cell of a freshly inserted row — regains focus. Structure edits
never dump the caret outside the grid.

Source normalization: structure edits rewrite the table with padded,
column-aligned source so the plain-text file stays readable (unpadded
output is a standing complaint against editors that emit it; Typora pads).
Cell text is escaped so a user-typed `|` cannot break the grid.

Not supported: column-width resizing — GFM has no width syntax to persist
it (editors that offer resizing store widths in a proprietary block model,
outside the Markdown). Read-only documents render the grid with no editing
affordances.

### Horizontal rule (`---`, `***`, `___`)

- Composing: raw dashes until commit, then rendered as a horizontal rule.
- The rule is atomic: caret positions exist before/after it; Backspace after
  it deletes the whole rule.

### HTML block

- Common non-executable HTML uses the broad-safe preview by default, with a
  per-block source/preview toggle; harmless formatting does not require a trust
  prompt.
- External `https` iframe syntax becomes an isolated web embed whose loading
  follows workspace privacy policy. Local scripts, `srcdoc`, and executable
  workspace HTML are not ordinary HTML previews.
- The caret cannot enter a rendered block; it is atomic like the rule. Editing
  happens through the block's source toggle.

### Not yet supported (spec reserved)

Math blocks (`$$`), YAML front matter, footnotes, and `[toc]` follow the
same pattern when added: raw while composing, commit on Return, rendered or
hidden markers after, atomic Backspace at the boundary.

## 6. Inline elements

Reveal predicate (all inline elements): the element expands when a
**collapsed caret** is strictly inside the element's source range —
`from < caret < to`. At exactly `from` or `to` the element stays collapsed.
This is stricter than reveal-on-any-touch live previews and fixes
Typora's end-boundary leak (#443). Range selections never reveal
(principle 6).

While revealed: delimiters become visible, dimmed, in a slightly reduced
size; the content keeps its rendered style. While collapsed: delimiter
ranges are hidden and atomic.

| Element | Collapsed rendering | Notes |
| --- | --- | --- |
| `**strong**` / `__strong__` | bold text | |
| `*em*` / `_em_` | italic text | |
| `~~strike~~` | strikethrough | |
| `` `code` `` | monospace chip | chip background in both states |
| `[label](url)` | link-styled label | URL part hidden; see click rules below |
| `[[target]]` / `[[t\|alias]]` | wiki-link label | resolved/missing/ambiguous styling kept |
| `![alt](src)` | inline image | atomic; see below |
| `<https://…>` / bare URL | link text | brackets hidden |
| common safe inline HTML, including `<span style="color: …">text</span>` | sanitized semantic/styled content | tags reveal per element; blocked capabilities are diagnosed and omitted when structure remains honest, otherwise source stays visible |
| `\*` escapes | the escaped char | backslash hidden |

Keyboard traversal example for `**bold**`, caret approaching from the right:

1. Caret after the element; everything collapsed.
2. ArrowLeft skips the atomic hidden `**` and lands inside the content →
   element reveals; delimiters are now plain text.
3. Further arrows move through every character, including delimiters.
4. Caret exits past `from` or `to` → element collapses again.

Deletion:

- Backspace with the caret immediately after a collapsed element deletes the
  hidden closing delimiter *as one unit* (`**` for bold; for links the whole
  trailing `](url)` group). The now-broken syntax stops parsing, so the
  element naturally un-renders into visible source for further editing.
- Selecting across a collapsed element and typing replaces the full source
  range, hidden characters included.
- Backspace inside a revealed element is plain character deletion.

Links and images:

- Plain click on a link label places the caret (revealing if it lands
  inside); ⌘-click (or Ctrl-click) opens the target. Rationale: this is an
  editor first; click-to-open misfires while editing.
- An image is atomic. Click selects it; Backspace deletes the whole
  `![alt](src)` range; Return with the image selected (or a second click)
  expands it to source for editing.

Typing completion: typing the closing delimiter renders the element
instantly (caret ends at `to`, which is outside per the strict predicate).
Typing an opening delimiter alone shows raw text — unmatched syntax is
always raw, never guessed at.

## 7. Caret, keyboard, and selection semantics

- Hidden marker ranges are atomic for caret motion and for single-character
  deletion (they delete as a unit, per element rules above).
- `Home` goes to the visible start (after hidden block markers). There is no
  caret position between hidden marker characters.
- ArrowLeft at a line's visible start moves to the end of the previous line,
  skipping the hidden prefix entirely.
- Vertical caret motion preserves the visual column; passing through lines
  must not reveal or restyle anything.
- Formatting shortcuts operate in rendered state: ⌘B/⌘I/⌘⇧X (strike) /⌘E
  (inline code) toggle delimiters around the selection or word under caret;
  ⌘1–⌘6/⌘0 set block type; ⌘K wraps a link.
- Copy always yields Markdown source, including hidden syntax inside the
  selected range. Cut behaves identically.
- Undo of any marker-unit deletion restores the marker and the rendered
  state in one step.
- A selection that fully covers a replaced widget (table, code block,
  diagram, HTML block, image) marks that widget **block-selected**: the
  whole widget shows an accent ring, because native selection painting
  cannot enter replaced widgets. The state is visual only — copy/delete
  already operate on the underlying source range. For tables, clicking
  anywhere inside a cell (text or empty padding) focuses that cell; it
  does **not** block-select the table. Cell-edit chrome is a full-cell
  inset ring on the `td`/`th`, not a ring on the text. Block select for
  tables comes from document-level selection only (drag / ⌘A).
- Rich replaced widgets reveal the same boundary before selection: hover or
  keyboard focus shows a quiet 2px neutral ring, while block selection uses a
  2px accent ring. The ring is paint-only (`box-shadow`), so it never changes
  layout. A widget's outer wrapper owns block spacing, while the rendered inner
  surface owns the ring, so vertical rhythm stays outside the visible frame.
  Tables likewise render the ring on the table frame to avoid double borders;
  typographic constructs such as headings, lists, and horizontal rules do not
  receive block chrome.
- HTML blocks keep their source/preview toggle hidden at rest. The control
  fades in when the block is hovered, contains keyboard focus, or is selected,
  preserving both a quiet canvas and keyboard discoverability.

## 8. Input edge cases

- **IME composition**: while an input-method composition is in progress, the
  reveal/collapse/composing state of the composed line must not change until
  the composition ends. Otherwise CJK input breaks mid-composition.
- **Mouse drag**: because selections never reveal (principle 6), dragging
  across rendered elements produces zero layout shift, with no special
  casing needed.
- **Paste**: pasted content commits immediately (no composing state).
  Pasting a URL over a selected word wraps it as `[word](url)`
  (enhancement).
- **Auto-pairing**: optional Typora-style pairing of `**`, `*`, `` ` ``,
  `[[` is an enhancement and must respect the composing rules (pair
  characters are raw until the syntax completes).
- **Read-only / unfocused**: everything renders; no reveal, no composing.

## 9. Deliberate divergences

- **From Typora**: no rich-text block merge on forward-delete (we keep
  source-honest merges); no reveal-on-focus preference initially; strict
  interior reveal predicate (fixes end-boundary leak #443); heading style is
  kept if a future preference reveals block markup (fixes #285); heading
  levels remain editable in place via shortcuts (fixes #98).
- **From line-reveal live previews**: no active-line source reveal, no
  selection-triggered reveal — that model accepts line churn to make markup
  always reachable; we cover reachability with atomic backspace + commands
  instead.

## 10. UX references

- Typora Quick Start — live rendering rules:
  <https://support.typora.io/Quick-Start/>
- Typora Markdown Reference — span expand-on-cursor, block commit-on-Return:
  <https://support.typora.io/Markdown-Reference/>
- Typora Shortcut Keys: <https://support.typora.io/Shortcut-Keys/>
- typora-issues #98 (heading level invisible after commit),
  #285 (reveal-on-focus loses heading style),
  #443 (source leak at span end),
  #1317 (WYSIWYG consistency proposal),
  #6430 (extend live rendering to more elements):
  <https://github.com/typora/typora-issues>

---

# Part 2 — Migration plan (current work)

Scope: this is **not** an architecture or engine migration. CodeMirror 6,
the Markdown-text document model, the React host
(`MarkdownCodeMirrorEditor.tsx`), and the save / AI-edit / conflict-marker
integrations are untouched. The work replaces one behavior (line-level
reveal) and adds new capabilities (composing lifecycle, keyboard commands)
inside the shared-ui extension layer.

Rollout mechanism: live preview is already a reconfigurable `Extension`
behind `livePreviewCompartmentRef`. This migration landed as a direct
replacement: the rejected line-reveal behavior is removed, and the Part 1
pipeline is the only live-preview pipeline. Future risky editor experiments
can still use the compartment to ship behind a temporary variant switch, but
no switch remains for this migration.

After every code change in `vendor/shared-ui`, run
`npm run check:shared-ui`. `vendor/shared-ui/GENERATED.md` is the current
source-of-truth note: the historical sync scripts named in
`vendor/shared-ui/AGENTS.md` do not exist in this repository.

## 11. To-do list

Phases in dependency order; each phase lands independently.

**Phase 0 — carve-out**

- [x] Split the widgets (code block, table, HTML, image, task checkbox,
      rule, hidden syntax) and the measure/coords helpers out of
      `markdownCodeMirrorExtensions.ts` into vertical `features/` modules and
      feature-agnostic `shared/widgets/` primitives.
- [x] Extract the link-open handlers and facets into their own modules.
- [x] Replace the old line-reveal pipeline directly with the new default
      pipeline. No dev-facing variant switch remains because the rejected
      behavior is removed rather than retained for rollout.

**Phase 1 — element model**

- [x] `core/syntax/markdownElements.ts`: walk the Lezer syntax tree into
      normalized `{ kind, from, to, markerRanges, contentRange }` records
      for headings, lists, tasks, quotes, emphasis/strong/strike, inline
      code, links, autolinks, images, wiki links, rules, fences, tables,
      and HTML blocks.
- [x] Fixture unit tests: headings, wiki links, standard links, link titles,
      autolinks, escaped characters, task brackets, image atomicity,
      range-scoped lookup, hidden-marker caret normalization, nested quotes,
      and strict inline reveal boundaries.

**Phase 2 — new pipeline v1 (element reveal)**

- [x] Dev-facing variant switch choosing the old/new pipeline inside the
      live preview compartment. Completed as a direct default flip: the old
      line-reveal behavior is no longer present.
- [x] Reveal predicate per Part 1 §6: collapsed caret strictly inside an
      inline element; block markers never reveal; focused, editable
      documents only.
- [x] Hidden markers stay `Decoration.replace` + atomic ranges; rebuilds
      keyed on reveal-set identity, not raw selection positions.
- [x] IME guard: composition state updates are deferred out of the DOM
      composition event stack and cross-check `view.composing` before
      suppressing decoration rebuilds.

**Phase 3 — composing lifecycle**

- [x] StateField tracking the caret line's uncommitted block prefix;
      entered by `input.type`/`delete.backward` changes to the prefix,
      never by undo/redo or external updates.
- [x] Commit on Return / caret-leave / blur / paste; a composing line
      renders raw through the existing `cm-md-source-line` styling path.

**Phase 4 — keyboard layer** (live-preview scoped; source mode uses normal
CodeMirror text editing)

- [x] `deleteMarkerBackward` / `deleteMarkerForward`: atomic hidden-prefix
      deletion (`#… `, `> `, `- `, `- [ ] ` staged) and closing-delimiter
      unit deletion after collapsed inline elements.
- [x] Block type commands: ⌘1–⌘6, ⌘0, quote/list/task toggles.
- [x] Inline toggles: ⌘B / ⌘I / ⌘E / ⌘⇧X / ⌘K.
- [x] Return continuation/exit for lists, tasks, quotes; ordered-list
      renumbering.
- [x] Source-mode isolation: commands that depend on hidden syntax are only
      installed inside the live-preview compartment.

**Phase 5 — interaction polish**

- [x] Link click places the caret; ⌘-click opens; read-only click opens;
      Cmd/Ctrl+Enter follows the link under the caret; pointer cursor appears
      only while the open modifier is down.
- [x] Image atomic selection; Return / second click expands to source.
- [x] Fence code block arrow-key exit and empty-block Backspace delete; Home
      targets; caret geometry (`coordsAt`) around hidden markers.
- [x] Table arrow-key entry/exit and Tab / Shift-Tab cell movement.
- [x] Copy/cut emit full Markdown source across collapsed elements.

**Phase 6 — bake-off and removal**

- [x] Acceptance checklist derived from Part 1 §5–§8; verified on the
      remaining new pipeline with focused element-model tests plus full
      `npm test`, `npm run build`, `npm run lint`, `npm run check:shared-ui`,
      and `git diff --check`. The line-reveal pipeline has been removed, so
      there is no second pipeline to accept.
- [ ] Manual CJK IME pass on macOS after the next desktop smoke run. The
      implementation avoids synchronous composition-event dispatch, but IME
      correctness is still a real-device interaction check.
- [x] Flip the default to the new pipeline.
- [x] Delete the line-reveal pipeline and the variant switch.

**Phase 7 — Mermaid diagram block** (additive feature on the same
pipeline; not part of the reveal migration). Infrastructure audit as of
2026-07 — the `[x]` items already exist and need no work:

- [x] Fence detection with language info: `getMarkdownCodeBlock` already
      returns `language`; the composing lifecycle already keeps a
      ```` ```mermaid ```` line raw until commit.
- [x] Block widget pipeline: `Decoration.replace({ block: true })` + atomic
      ranges via `addReplacementDecoration`.
- [x] Edit-and-commit surface pattern: `CodeBlockWidget` (textarea, commit
      on blur/Escape, ArrowUp/Down boundary exit).
- [x] Async preview + toolbar + loading-state pattern: `HtmlBlockWidget`.
- [x] Height stability: `estimatedHeight` estimators +
      `MarkdownWidgetMeasureController`.
- [x] Theme variable mapping pattern: `getTrustedHtmlThemeCss` reads
      `--po-*`; Mermaid needs the same reads shaped as `themeVariables`.
- [x] Legacy trusted-iframe and height `postMessage` infrastructure exists in
      `HtmlBlockWidget`; it is not the adopted active-content boundary and is
      scheduled for replacement under Architecture §§7 and 12–15.

New work:

- [x] Add the `mermaid` dependency; load it only via dynamic `import()` so
      it never enters the main bundle.
- [x] `features/mermaid/mermaidRenderer.ts` singleton: initialize on demand
      (`startOnLoad: false`, `securityLevel: "strict"`,
      `suppressErrorRendering: true`, theme mapped from `--po-*`);
      `parse()` before `render()`; ~250 ms debounce while editing; SVG
      cache keyed by source + theme; invalidate on theme change.
- [x] `MermaidBlockWidget` (widgets/): diagram by default; Edit opens the
      source-over-preview split; keeps the last successful SVG through
      invalid intermediate states with an inline error strip; read-only
      shows the diagram only.
- [x] Detection branch in `addMarkdownBlockAndLineDecorations`:
      `language === "mermaid"` → `MermaidBlockWidget` instead of
      `CodeBlockWidget`.
- [x] Widget CSS: container, toolbar, error strip, fit-to-width SVG.

**Phase 8 — table structure editing** (additive feature on the same
pipeline). Infrastructure audit as of 2026-07 — the `[x]` items already
exist and need no work:

- [x] Table block parser with cell positions:
      `features/table/tableModel.ts` (`getMarkdownTableBlock` → rows/cells with
      `from`/`to`).
- [x] In-place cell editing: contenteditable cells committing precise
      `cell.from`–`cell.to` changes on blur; Escape reverts; Enter commits.
- [x] Cell navigation: Tab / Shift-Tab between cells; ArrowUp/Down
      entry/exit at boundary rows.
- [x] Pipe escaping for cell text (`sanitizeMarkdownTableCell`).
- [x] Single-dispatch undo granularity (CM history already in the base
      extensions; each op below must stay one dispatch).

New work, in dependency order:

- [x] Model layer (`tableModel.ts`): parse the delimiter row's `:---:`
      alignments into the block model (currently discarded), and add a
      `serializeMarkdownTable` that emits padded, column-aligned source.
- [x] Pure structural operations on the parsed block, each returning the
      replacement text for the whole `[from, to)` range: insert row
      above/below, delete row, move row up/down, insert column left/right,
      delete column, move column left/right, duplicate row, set column
      alignment. Sort-by-column is an optional follow-up.
- [x] Unit tests for the model ops (same fixture pattern as
      `markdownElements` tests): ragged rows, escaped pipes, alignment
      preservation, single-row/single-column edge cases.
- [x] Render alignment: apply per-column `text-align` in
      `MarkdownTableWidget` from the parsed alignments.
- [x] Focus continuity: structural dispatches rebuild the widget DOM
      (`eq()` fails), destroying the focused cell. Record the target
      logical cell (row, column) before dispatch and refocus it after the
      rebuilt widget mounts. Without this every structure edit kicks the
      user out of the table.
- [x] Keyboard layer: Tab in the last cell appends a row and focuses its
      first cell (replaces today's exit behavior); Enter commits and moves
      to the cell below (exits below the table from the last row);
      Mod-Enter inserts a row below the current one.
- [x] Context menu on cells with the full operation set, reusing the
      shared desktop menu surface (`docs/architecture/desktop-menu-surface.md`).
- [x] Hover "+" strips along the right/bottom table edges appending a
      column/row, with deliberate hit areas (see Part 1 §5 on the
      accidental-insert risk of thin edge affordances).
- [x] Widget CSS: alignment classes, hover strips, menu affordances,
      read-only suppression.
- [x] Drag handles for row/column reorder: one handle pair
      tracks the hovered cell (row handle on the hovered body row's left
      border, column handle on the hovered column's top border; header row
      has no row handle); click/right-click opens the scoped operations
      menu; drag shows a source highlight plus an accent drop-indicator
      line at the insertion boundary, applies one model-layer move on
      release, and cancels on Escape.

**Phase 9 — module split** (no behavior change; see §13 note 10 for the
layout and layering rules):

- [x] Split `widgets/markdownLivePreviewWidgets.ts` (~2 350 lines) into
      vertical feature modules under `features/`, including the complete
      `features/table/` package.
- [x] Split `markdownCodeMirrorExtensions.ts` (~1 490 lines) into
      `keymap/`, `state/`, and `decorations/` layers; the original file
      remains as the thin public assembly (base + live preview extension
      factories, theme, highlight style).
- [x] Split `styles/editor.css` (~2 840 lines) into `styles/editor/`
      section files behind an ordered `@import` entry point (same public
      path, so `package.json` exports and `shared-ui.css` are untouched).
- [x] Full verification: `tsc --noEmit`, vite build, markdown unit tests,
      ESLint (no new warnings), `check:shared-ui`.

**Phase 10 — table interaction polish** (Part 1 §5 Table, "Pointer
feedback and motion" / "Selection"; §7 block-selected rule):

- [x] Cell-scoped hover: drop the whole-row hover tint; tint only the
      hovered body cell and brighten the table frame on wrapper hover.
- [x] Motion: drag handles fade in/out via an `is-visible` class instead
      of the `hidden` attribute; visible handles glide (`left`/`top`
      transition) to the next row/column, hidden ones reposition
      instantly before fading in (`showHandleAt` flushes the position
      write first). Context menu opens with a 120 ms fade/scale. All
      table transitions are disabled under `prefers-reduced-motion`.
- [x] Block-selected state: a `ViewPlugin`
      (`core/interaction/blockWidgetSelection.ts`) toggles `is-doc-selected` on
      replaced widgets whose source range is fully covered by a non-empty
      focused selection — accent ring + cell wash on tables, shared
      accent ring on code/mermaid/HTML/image widgets. For tables, block
      select is document-selection only; clicking inside a cell never
      selects the whole table.
- [x] Cell hit target fills the cell: `td`/`th` use the classic
      `height: 1px` stretch so `.cm-md-table-cell-content` covers the full
      row height; padding clicks that still land on `td`/`th` are routed
      to `editor.focus()`. Clicking empty cell space focuses that cell —
      never the whole table.
- [x] Cell-edit chrome on `td`/`th:focus-within` (full-cell inset ring),
      not on the contenteditable text span — row height is driven by the
      tallest cell, so a ring on the span hugged the text and left empty
      padding.

## 12. Code change map

| Area | Current (`markdownCodeMirrorExtensions.ts`) | Target (Part 1) |
| --- | --- | --- |
| Reveal granularity | Whole caret line reveals all syntax | Per inline element; block markers never |
| Reveal trigger | Caret/selection touches line + focus | Collapsed caret strictly inside element |
| Composing state | None (line reveal doubles as it) | Explicit composing → commit lifecycle |
| Backspace at block start | Deletes into revealed source text | Atomic hidden-marker deletion, one keystroke |
| Heading level edit | Reveal line, edit hashes | ⌘1–⌘6/⌘0 commands (+ backspace demote) |
| Inline detection | Regex per line | Lezer syntax tree + custom scanners only for non-Lezer extensions |
| Selection reveal | Selection lines reveal fully | Never |
| IME guard | None | Skip rebuilds while composing |
| Fences/tables/HTML/images | Block or inline widgets | Unchanged model; keyboard entry/exit polish |
| Link click | Click opens link | Click edits; ⌘-click opens |
| Mermaid fences | Generic editable code-block widget | Rendered diagram; in-place split editing (Phase 7) |
| Table structure | Cell edit + navigation only; no row/column ops, alignment ignored | Model-layer ops behind keyboard / menu / hover entry points (Phase 8) |

User-visible behavior changes shipped by this migration:

- Line-level source reveal disappears (the point of the migration).
- Link single-click stops opening the target; opening moves to ⌘-click.

Everything else is a strict UX upgrade over the same document format. Note
that the formatting/heading keyboard commands (⌘1–⌘6, ⌘0, ⌘B/⌘I/…) do not
exist today and become load-bearing in the new model — they ship together
with the reveal changes, not after.

## 13. Implementation notes

Current building blocks that stay:

- `StateField<DecorationSet>` + `EditorView.atomicRanges` (block widgets
  that change vertical geometry must come from a StateField, not a
  ViewPlugin, so geometry is known before the view measures).
- `Decoration.replace` with zero-width widgets for hidden syntax, with
  `coordsAt` overrides so the caret has geometry next to widgets.
- Widget `eq()` identity to avoid DOM rebuild churn; `estimatedHeight` for
  scroll stability.

Changes required by Part 1:

1. **Reveal predicate rewrite.** Replace `getLivePreviewSourceLineNumbers`
   (line granularity) with a per-element predicate: collapsed caret
   strictly inside the element range, single main selection, editor
   focused, not read-only, not composing (IME). Block marker kinds
   (`heading`, `list`, `task`, `blockquote`) are *never* revealed by the
   caret; only `delimiter`, `link`, `wiki-link` kinds participate.
2. **Composing-line tracker.** A `StateField` tracking
   `{ line, committed }`: a caret line enters composing when a user-typed
   change (`input.type` user events) modifies its block-marker prefix; it
   commits on Return / caret-leave / blur / non-typing changes. While
   composing, the line renders fully raw with paragraph styling (reuse
   today's `cm-md-source-line` styling path).
3. **Marker deletion command.** A keymap entry ahead of the default
   Backspace: if the caret sits at a visible block start, delete the hidden
   prefix range (`#+ `, `> `, `- [ ] `…) in one change; if immediately
   after a collapsed inline element, delete its closing delimiter unit.
   Forward Delete gets the mirrored behavior. Everything else falls
   through.
4. **Syntax-tree-driven element detection.** Inline decorations and reveal
   now share `core/syntax/markdownElements.ts`, backed by Lezer ranges for core
   Markdown (`EmphasisMark`, `CodeMark`, `LinkMark`, `QuoteMark`, …) and
   custom scanners only where the parser does not provide first-class nodes
   (wiki links, image embeds, task brackets, tables, HTML block discovery).
   The model is cached by immutable `Text` document and supports
   range-scoped lookup for caret/command paths, so plain cursor movement and
   one-line commands do not repeatedly scan the whole document.
5. **Reveal styling.** Revealed inline delimiters keep the content's
   rendered style (bold stays bold — avoids Typora issue #285). Dimmed
   delimiter color, no size change, no animation initially. If animation is
   added later, use the `max-width`/`font-size` transition technique (not
   `display:none`) so line height never jumps, and honor
   `prefers-reduced-motion`.
6. **Guards.** Skip decoration rebuilds while the editor is composing text
   (IME); composition state is deferred out of the DOM event stack and
   checked against `view.composing`. Drag flicker needs no guard because
   selections never reveal. Rebuild cost stays acceptable by keying rebuilds
   on `docChanged | reconfigured | focusChanged | revealSetChanged` —
   compute the reveal set key from element ranges under the caret, not from
   raw selection positions, so plain caret movement inside a paragraph does
   not rebuild anything.
7. **Performance.** Current code decorates the whole document; acceptable
   for typical notes, but viewport-scoped iteration (`view.visibleRanges`)
   via a companion ViewPlugin is the escape hatch for very large files.
   Keep expensive widgets (if added, e.g. math) behind a render cache keyed
   by source text.
8. **Mermaid rendering service (Phase 7).** One module owns the library
   lifecycle: lazy `import("mermaid")` on first use (the library is >1 MB
   minified and must never enter the main bundle — Vite code-splits dynamic
   imports automatically); `initialize()` exactly once with
   `startOnLoad: false`, `securityLevel: "strict"` (HTML in labels encoded,
   click callbacks disabled — the strictest supported mode) and
   `suppressErrorRendering: true`; validate with
   `mermaid.parse(text, { suppressErrors: true })` before
   `mermaid.render(id, text)` (v11 queues renders serially, which prevents
   race conditions); unique render ids per call; cache SVG output keyed by
   source + theme; map `--po-*` CSS variables into `themeVariables` the way
   `getTrustedHtmlThemeCss` already does for HTML previews. The singleton
   re-applies Mermaid config only when the theme key changes, and widgets
   subscribe to one shared theme-change observer instead of each installing
   its own `MutationObserver`. SVG output is sanitized after Mermaid renders:
   keep `foreignObject` for diagram types that need it, but strip dangerous
   nodes, event attributes, and resource-loading `href` / `src` attributes.
   Widgets keep the last good SVG while the user types through invalid
   intermediate states. Never use `startOnLoad` / `mermaid.run()` DOM scanning:
   CodeMirror rebuilds widget DOM at will, so a global scan's lifecycle
   cannot be controlled.
9. **Table structure operations (Phase 8).** Structural edits are pure
   text transforms: parse the block (`getMarkdownTableBlock`), mutate the
   cell matrix, serialize back to normalized pipe source, and dispatch one
   change replacing the whole `[from, to)` block — never cell-by-cell
   patches. One dispatch is what makes each operation a single undo step
   and keeps the parser, the widget, and the file trivially consistent.
   The serializer pads cells to aligned column widths so the on-disk text
   stays human-readable (the survey consensus: Typora pads; unpadded
   output draws standing complaints wherever it ships; either way the
   file stays plain Markdown).
   The hard part is **focus continuity**: a structural dispatch changes
   `rows`/`from`/`to`, so `eq()` fails and CodeMirror rebuilds the widget
   DOM, destroying the focused contenteditable cell. The feature emits one
   atomic source/selection/focus transaction. An editor-scoped StateField
   carries a tokenized request, and a feature-owned ViewPlugin restores focus
   only after CodeMirror has committed the replacement DOM. `toDOM()` never
   dispatches. All entry points (keymap commands, context menu items, hover
   strips, pointer drag) call the same feature command and model functions —
   the UI layers own no table-mutation logic. Column-width resizing is
   explicitly out of scope: GFM has no syntax to persist it.
10. **Module layout (Phase 9, superseded by the vertical-feature migration).**
    The editor is a hybrid modular monolith: stable machinery is layered, while
    complex capabilities keep model, plan, interaction, and widget code
    together. Public assembly remains thin:

    ```text
    editor/markdown/
      markdownCodeMirrorExtensions.ts   assembly: extension factories, theme
      core/                             syntax, plans, commands, decorations
        commands/                       view → transaction commands
        syntax/                         Lezer-backed semantic projection
        plans/                          typed plan contract + compiler
        state/                          generic StateFields/effects
        decorations/                    plan → CodeMirror decorations
      features/
        blockFeatureRegistry.ts         typed block composition boundary
        inlineFeatureRegistry.ts        typed inline composition boundary
        table/                          model/plan/commands/focus/widget/drag
        html/                           tokenizer/model/plan/policy/widget
        code-block/                     model/plan/widget
        mermaid/                        renderer/widget
        image/                          model/plan/widget
      platform/                         security, policy, brokers, sessions
      shared/                           feature-agnostic DOM/measure helpers
    ```

    `scripts/check-markdown-architecture.mjs` rejects legacy horizontal
    directories, platform-to-feature dependencies, shared upward dependencies,
    DOM-backed plans, and core imports of concrete feature widgets.

    `styles/editor.css` is an ordered `@import` list over
    `styles/editor/*.css` section files (preview surfaces, code editor,
    chrome, markdown base, code/html/inline/table widgets, status). The
    public exports (`markdownCodeMirrorExtensions.ts`, `./editor.css`)
    did not move, so consumers are unaffected.

11. **Vertical rhythm.** Two spacing systems, following the block-editor
    convention: `line-height: 1.68` spaces wrapped visual lines *inside*
    a block, and per-line vertical padding
    (`--po-markdown-editor-line-spacing`, 3px top and bottom) spaces
    source lines (blocks) apart — a single-line block advances ~2.1× the
    font size. The token is defined at 0 and opened up only under
    `[data-live-preview="true"]`, so source mode stays compact. Blank
    separator lines (`.cm-line` with a lone `<br>`) and table source
    lines are excluded so paragraph gaps and mono blocks don't compound.
    Anything that positions against the first text line must add the
    token (the task checkbox uses `top: calc(token + 0.84em)`); heading
    line paddings override the token by specificity.

12. **Block-widget selection state (Phase 10).** Native selection cannot
    paint a replaced widget's interior: CM6 replaces the source range
    with a `contenteditable="false"` DOM island, so a drag or ⌘A that
    covers a table highlights the text around it and nothing inside it.
    `drawSelection` doesn't fix this either — no text layer exists there
    to paint. The remedy is state-driven, not selection-driven:
    `core/interaction/blockWidgetSelection.ts` is a `ViewPlugin` that, on
    selection / doc / viewport / focus changes, finds the rendered block
    widgets in `contentDOM`, maps each to its source range
    (`posAtDOM` + the decoration set), and toggles `is-doc-selected`
    when a non-empty, focused selection fully covers the range. Class
    toggling runs in a `requestMeasure` write phase (never during
    `update`), touches only widget-owned DOM, and rebuilds nothing —
    the visual state costs no decoration churn. Editing semantics need
    no help: copy/cut/delete already operate on the covered source
    range.

13. **Table motion (Phase 10).** Handle visibility is class-driven
    (`is-visible`), never the `hidden` attribute — `display: none`
    cannot transition. The one subtlety is repositioning while hidden:
    `left`/`top` are in the transition list so a *visible* handle glides
    between rows/columns, but a *hidden* handle must not glide in from
    its stale position, so the base (not `.is-visible`) rule excludes
    the position properties from the transition and `showHandleAt`
    flushes the position write (a `getBoundingClientRect` read) before
    adding the class. Handles are `tabIndex = -1`: they are a
    pointer-only affordance and the context menu covers keyboard access.
    Hover tint lives on `td:hover` (cell-scoped), the frame brightens
    via wrapper `:hover`, and every transition is disabled under
    `prefers-reduced-motion`.

14. **Table click / focus chrome (Phase 10).** Primary interaction is
    cell focus, not block select. Clicking anywhere inside a cell —
    including empty padding below short text in a tall row — focuses
    that cell's contenteditable and paints a full-cell inset ring via
    `td:focus-within` / `th:focus-within`. Two mechanisms make padding
    clicks reliable: (1) the classic table stretch (`td { height: 1px }`
    + child `height: 100% / min-height: 100%`) so the editor fills the
    cell; (2) a `table` mousedown fallback that, when the event target
    is `td`/`th` rather than `.cm-md-table-cell-content`, calls
    `editor.focus()` instead of selecting the table. Block select
    (`is-doc-selected`) remains for document-level selections that
    cover the table source range; it is never the result of an in-cell
    click. Entering a cell collapses any covering block selection so
    the two chromes never stack. (An earlier "first click selects the
    table" model was wrong for tables — that pattern fits atomic media
    like images, not grids whose primary unit is the cell.)

## 14. Background: architecture research

| | contenteditable rich DOM (Typora) | Structured model (ProseMirror family) | Plain text + decorations (CM6) |
| --- | --- | --- | --- |
| Document model | DOM + parallel MD model, bidirectional sync | PM node tree; MD only at import/export | Markdown string is the model |
| Examples | Typora | Milkdown, Tiptap, markora, typora-web | HyperMD (CM5), ink-mde, codemirror-rich-markdoc, mainstream note-app live previews |
| Source fidelity | Serializer output, can drift from input | Serializer output; delimiters/escapes normalized | Byte-perfect by construction |
| Reveal-on-caret | Re-insert source text into DOM per element | Hard: model has no delimiter chars; needs hacks (typora-web stores delimiters *in* text) | Natural: stop hiding a decoration |
| Effort/risk | Highest (own input pipeline on contenteditable, `beforeinput` interception) | High (round-trip fidelity, NodeView caret traps) | Lowest for an MD-source product |

Conclusion: for a product whose files are Markdown on disk and whose editor
already runs CodeMirror 6, the CM6 decoration architecture is the correct
one — it is the architecture proven at scale by the leading CM6-based
note apps. A true second engine would have to
reimplement every CM6 integration in this repo (AI edit decorations,
conflict markers, save/external-update transaction flow, link graph
handlers) and gives up byte-perfect round-tripping. No engine change; the
work is in the interaction model.

How Typora is built (for reference):

- Electron app; the editing surface is a large `contenteditable` region
  rendering an HTML view of the document, kept in sync with an internal
  Markdown model (community reverse-engineering: input events /
  `beforeinput` are intercepted, the MD model is updated, and the DOM is
  patched — not a browser-default contenteditable).
- Complex blocks are isolated islands: fenced code blocks are embedded
  **CodeMirror 5** instances inside `contenteditable="false"` containers
  (visible in `File.editor.fences.queue`; the typora_plugin ecosystem hooks
  these directly). Tables and math get similar dedicated sub-editors
  (MathJax preview for math).
- Block markup commits on Return (Part 1 §2.3); span markup re-parses on
  every keystroke. Source mode is a separate full-document CodeMirror view.
- Takeaway: even the contenteditable flagship falls back to "real text
  editor inside a widget" for code — which validates the widget approach
  used here for fences/tables.

## 15. Implementation references

- CodeMirror decorations guide (StateField vs ViewPlugin):
  <https://codemirror.net/docs/ref/#view.Decoration>
- CodeMirror discuss — concealing syntax pattern:
  <https://discuss.codemirror.net/t/concealing-syntax/3135>
- CM6 live-preview reference implementations:
  <https://github.com/segphault/codemirror-rich-markdoc>,
  <https://github.com/fedoup/markdown-editor>,
  <https://github.com/conql/codemirror-live-markdown>,
  <https://github.com/laobubu/HyperMD> (CM5 ancestor)
- Typora internals analysis (contenteditable + MD model sync, CM5 fences):
  <https://www.zhihu.com/en/answer/1898639952197158128>,
  <https://deepwiki.com/obgnail/typora_plugin/12.3-codemirror-integration-and-editing-features>
- ProseMirror-family Typora clones (for contrast):
  <https://github.com/KevinWang15/markora>,
  <https://github.com/Yuyz0112/typora-web>,
  <https://discuss.prosemirror.net/t/replicating-typoras-inline-display-math-editing/2906>
- Mermaid usage/API (render, parse, securityLevel):
  <https://mermaid.js.org/config/usage.html>
- Typora table editing (⌘Enter row insert, Tab appends, context menu,
  drag reorder): <https://support.typora.io/Table-Editing/>
