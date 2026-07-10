# Markdown Editor Architecture

Status: **Draft for review. No implementation work is implied by this document.**

This document defines the durable technical architecture for PuppyOne's
Markdown editor. It complements, but does not replace, the product behavior in
[Markdown Live Preview Editing UX](live-preview-ux.md).

- This document owns data flow, layer boundaries, extension contracts,
  security boundaries, and renderer consistency.
- The UX document owns what users see, when syntax is revealed, how composing
  and commit work, and how the caret and selection behave.
- The file-format pipeline owns routing a `.md` file into the Markdown viewer;
  see [File Format and Viewer Pipeline](../file-format-viewer-pipeline.md).

---

## 1. Decision summary

PuppyOne uses a **Markdown-source-first, semantic-model-driven live preview**.

1. The CodeMirror document string is the only mutable source of truth while a
   file is open. The file on disk remains plain Markdown.
2. A CommonMark/GFM-compatible incremental parser derives syntax from that
   source.
3. A normalized semantic document derives product-level elements, source
   ranges, nesting, and edit metadata from the syntax tree.
4. A policy compiler turns raw semantic elements into safe render plans.
5. Live editing, read-only preview, export, indexing, and other consumers are
   adapters over the same semantic contract. They may not reinterpret the
   Markdown independently.
6. All user actions become CodeMirror transactions against the source. A
   rendered DOM node or widget is never a second editable document model.

The intended flow is:

```text
                    Markdown source
                (only mutable truth)
                           |
                           | transaction
                           v
               Incremental syntax parser
              (Lezer + PuppyOne dialect)
                           |
                           | derived, immutable
                           v
               Normalized semantic document
          (kind, ranges, nesting, markers, state)
                           |
                           v
                    Policy compiler
            (HTML, URL, CSS, assets, trust)
                           |
                           | safe render plan
             +-------------+--------------+
             |             |              |
             v             v              v
      Live editor      Read-only       Export/index
      decorations      preview         and automation
```

This is the source-first family used by Markdown-native editors. It is a
better fit for PuppyOne than making a rich-text tree the canonical model,
because PuppyOne must preserve files for Agents, diffs, version history,
external tools, and source-level interoperability.

---

## 2. Architectural invariants

These are correctness rules, not implementation preferences.

### 2.1 One mutable document model

Only the Markdown source is mutable. The syntax tree, semantic document,
render plan, decorations, widgets, link index, and outline are derived state.

Derived state may be cached and incrementally updated, but it must always be
discardable and reproducible from the source plus explicit editor context.

Consequences:

- Typing, paste, toolbar commands, task toggles, table edits, and AI edits all
  dispatch source transactions.
- Widgets do not maintain an authoritative copy of their content.
- Saving does not serialize the rendered DOM.
- Opening and saving a document without an explicit edit does not normalize or
  rewrite its Markdown.

### 2.2 Parse syntax once

The parser owns Markdown classification. Renderers must not independently
decide whether text is a heading, list item, inline HTML element, HTML block,
link, or another construct using ad hoc regular expressions.

Small scanners remain acceptable only when they refine a parser-recognized
node into source ranges the parser does not expose. Such scanners must:

- be scoped to the parser node's range;
- use a shared tokenizer rather than renderer-specific regexes;
- preserve quoted and escaped content;
- return an unsupported result instead of guessing;
- have fixtures covering malformed and incomplete input.

### 2.3 Normalize semantics once

The syntax tree describes grammar. The semantic layer describes what the
product can render and edit.

For example, two separate Lezer `HTMLTag` nodes become one semantic
`inlineHtml` element with an opening marker, content range, closing marker,
tag name, raw attributes, nesting, and support status.

Every downstream consumer receives that normalized element. A table cell,
list item, heading, and plain paragraph must not have separate definitions of
inline HTML.

### 2.4 Policy is separate from parsing and rendering

Parsing determines what the source says. Policy determines what PuppyOne may
render or activate. Rendering only receives policy-approved capabilities.

An unsafe element is still valid source and remains in the document. Policy
failure must never delete or silently rewrite it.

### 2.5 Unsupported syntax stays honest

When PuppyOne cannot safely or correctly render a construct, live preview
keeps its source visible and may attach a diagnostic. It must not:

- silently drop content;
- display a misleading partial result;
- execute unsupported behavior;
- mutate the source to a supported approximation.

Source mode remains the universal fallback for inspection and editing.

### 2.6 Adapters render; they do not reinterpret

A rendering adapter may choose a representation appropriate to its surface:

- CodeMirror marks and replacements in live editing;
- widgets for atomic block content;
- DOM nodes in read-only preview;
- HTML or another format during export;
- plain semantic text for indexing.

It may not implement a second Markdown grammar.

---

## 3. Layer ownership

### 3.1 Source and transaction layer

Owner: CodeMirror `EditorState` and commands.

Responsibilities:

- authoritative source text;
- selection and history;
- transactions and position mapping;
- read-only enforcement;
- external document updates;
- composing/IME state.

All edits must be representable as transactions. A complex operation such as
adding a table row may rewrite a source range, but it remains one auditable,
undoable transaction.

### 3.2 Parser and dialect layer

Owner: Lezer Markdown plus explicit PuppyOne parser extensions.

Responsibilities:

- CommonMark/GFM block and inline structure;
- syntax tree nodes and source offsets;
- incremental reparsing after changes;
- registered extensions such as wiki links or Obsidian-style image embeds.

The supported dialect must be explicit. A syntax extension is not complete
when only a tokenizer exists; it must join the feature contract in section 5.

### 3.3 Semantic document layer

Owner: pure modules with no DOM dependency.

Responsibilities:

- normalize parser nodes into a discriminated element model;
- pair related syntax such as opening and closing HTML tags;
- compute content and marker ranges;
- represent nesting without losing source positions;
- identify malformed, incomplete, or ambiguous constructs;
- expose query APIs for a document, block, paragraph, or visible range;
- cache by document identity and map or rebuild after transactions.

An illustrative model is:

```ts
type MarkdownSemanticElement =
  | MarkdownHeading
  | MarkdownListItem
  | MarkdownStrong
  | MarkdownLink
  | MarkdownInlineHtml
  | MarkdownHtmlBlock
  | MarkdownTable
  | MarkdownCodeBlock
  | MarkdownUnsupported;

type MarkdownInlineHtml = {
  kind: "inlineHtml";
  from: number;
  to: number;
  tagName: string;
  openingMarker: { from: number; to: number };
  contentRange: { from: number; to: number };
  closingMarker: { from: number; to: number } | null;
  attributes: readonly MarkdownHtmlAttribute[];
  children: readonly MarkdownSemanticElement[];
  status: "complete" | "incomplete" | "malformed";
};
```

This type is illustrative, not a requirement to create one large materialized
AST. Range-indexed projections are acceptable if they preserve the same
contract.

### 3.4 Policy compiler

Owner: pure policy modules plus URL and asset resolvers.

Responsibilities:

- allowed HTML tags and attributes;
- allowed CSS properties and value validation;
- safe link protocols and controlled link activation;
- image source validation and workspace asset resolution;
- `safe` versus `localTrusted` capabilities;
- block-versus-inline execution boundary;
- structured rejection reasons.

The compiler returns typed safe data, not HTML strings:

```ts
type SafeInlineHtmlMark = {
  kind: "inlineHtmlMark";
  tagName: "span" | "strong" | "em" | "mark" | "sub" | "sup" | "u";
  attributes: Readonly<Record<string, string>>;
};

type HtmlPolicyResult<T> =
  | { supported: true; value: T }
  | { supported: false; reasons: readonly string[] };
```

The live editor adapter must not receive arbitrary event attributes, raw
style text, or executable HTML.

### 3.5 Rendering adapters

#### CodeMirror live adapter

Uses:

- `Decoration.mark` for styled, still-editable source content;
- `Decoration.replace` for hidden delimiters and marker ranges;
- `EditorView.atomicRanges` for caret traversal over hidden ranges;
- line decorations for block styling;
- widgets only for content that is intentionally atomic or needs an embedded
  editing surface.

It must preserve source positions, selection, copy, undo, IME input, and
keyboard traversal.

#### Read-only preview adapter

Renders policy-approved semantic elements into DOM. It may optimize for
document reading rather than caret behavior, but it must follow the same
dialect and policy decisions as the live adapter.

#### Export and indexing adapters

Export may use a dedicated CommonMark renderer when necessary, but it must
share the dialect contract, policy, and conformance fixtures. Indexing consumes
semantic text and link targets, never rendered DOM.

It is acceptable for editing and export to use different parser libraries for
performance or format reasons. It is not acceptable for them to implement
different undocumented dialects.

### 3.6 Interaction state layer

Owner: editor state fields, effects, commands, and keymaps.

Responsibilities:

- composing, rendered, and revealed lifecycle;
- per-element inline reveal;
- atomic hidden-marker navigation;
- block selection and embedded-widget focus;
- source-preserving deletion and conversion commands;
- IME-safe update scheduling.

Interaction state refers to semantic element ranges. It must not infer element
identity from CSS classes or rendered DOM ancestry.

---

## 4. Render-plan boundary

The semantic document should not directly construct decorations or DOM. A
small render-plan boundary keeps product semantics independent of the view
technology.

Examples:

```ts
type InlineRenderPlan = {
  elementRange: { from: number; to: number };
  contentMarks: readonly ContentMark[];
  hiddenMarkers: readonly SourceMarker[];
  diagnostics: readonly MarkdownDiagnostic[];
};

type BlockRenderPlan =
  | { kind: "styledLines"; lines: readonly StyledLine[] }
  | { kind: "atomicWidget"; sourceRange: SourceRange; widget: WidgetModel }
  | { kind: "visibleSource"; sourceRange: SourceRange; diagnostic?: string };
```

The same semantic element and policy result should produce equivalent content
across adapters, even though a live adapter uses source ranges and a read-only
adapter uses DOM nodes.

---

## 5. Markdown feature contract

Every supported Markdown construct is delivered as a complete feature bundle.
The exact TypeScript API may differ, but the ownership must be explicit:

```ts
interface MarkdownFeature {
  id: string;
  syntax?: readonly MarkdownConfig[];
  normalize: MarkdownSemanticNormalizer;
  policy?: MarkdownFeaturePolicy;
  live: MarkdownLiveRenderer;
  preview: MarkdownPreviewRenderer;
  commands?: readonly MarkdownCommand[];
  fixtures: readonly MarkdownFixture[];
}
```

A feature is not complete merely because the parser recognizes it. Completion
requires:

1. syntax classification;
2. semantic normalization;
3. live rendering or an explicit visible-source fallback;
4. read-only rendering or an explicit fallback;
5. edit behavior where applicable;
6. security policy where applicable;
7. fixtures proving cross-context consistency.

The semantic union and renderers should use exhaustive TypeScript switches or
an equivalent registry check. Adding a new semantic kind without assigning a
renderer must fail a test or type check instead of silently becoming plain
source in one surface.

Feature bundles are an ownership discipline, not necessarily a runtime plugin
system. Built-in features may remain statically imported.

---

## 6. Inline HTML reference flow

Inline HTML is the first feature that must validate this architecture because
it currently exposes the split between parsing, block discovery, table-cell
rendering, and main-editor rendering.

Given:

```md
- <span style="color: #B45309;">Team-provided product screenshot</span>
```

the flow must be:

```text
Lezer syntax
  BulletList
    ListItem
      Paragraph
        HTMLTag(open span)
        text
        HTMLTag(close span)
              |
              v
Semantic normalization
  inlineHtml {
    tagName: "span",
    openingMarker,
    contentRange,
    closingMarker,
    attributes
  }
              |
              v
Policy compilation
  SafeInlineHtmlMark {
    tagName: "span",
    attributes: { style: "color: #B45309" }
  }
              |
              v
Live render plan
  mark content range with safe style
  hide opening/closing markers while collapsed
  reveal markers while caret is strictly inside
```

### 6.1 Classification

Block versus inline comes from the Markdown syntax tree:

- `HTMLBlock` uses the HTML block feature and an atomic block renderer.
- `HTMLTag` within a paragraph, heading, or list item participates in inline
  HTML normalization.

Line-start detection is not authoritative. An inline tag at the start of a
paragraph does not become a block merely because it is the first non-space
character.

### 6.2 Pairing and nesting

Lezer exposes raw inline tags as separate nodes, so the semantic layer must
pair them. Pairing must:

- use parser-recognized `HTMLTag` ranges;
- tokenize tag names and attributes with quote awareness;
- use a stack to support nesting and adjacent elements;
- recognize void elements separately;
- preserve incomplete tags while the user is typing;
- operate over the containing inline block, not assume one physical line;
- leave unmatched or malformed tags visible.

Nested Markdown remains independently renderable:

```md
<span style="color: red">This is **important**</span>
```

The HTML content mark and Markdown strong mark overlap legitimately. Range
reservation may protect replacement marker ranges, but it must not make entire
inline content ranges mutually exclusive. CodeMirror supports nested and
overlapping mark decorations.

### 6.3 Collapsed and revealed rendering

Collapsed:

- safe attributes style the content range;
- opening and closing tags are hidden replacement decorations;
- hidden tag ranges are atomic;
- text remains real CodeMirror content, not widget-owned text.

Revealed:

- the single inline HTML element's tags become visible and dimmed;
- safe content styling remains applied;
- sibling elements stay collapsed;
- a range selection does not reveal the element.

Malformed or unsupported:

- source remains visible;
- no unsafe attribute is applied;
- an optional diagnostic explains the unsupported part;
- switching to source mode always exposes the exact file content.

### 6.4 Inline HTML support boundary

The initial presentational set should remain deliberately small:

- tags: `span`, `strong`, `b`, `em`, `i`, `u`, `s`, `del`, `mark`, `sub`,
  `sup`, and `code`;
- attributes: `title`, `aria-label`, and a validated `style` subset;
- style properties: non-layout presentation such as `color`,
  `background-color`, `font-weight`, `font-style`, and `text-decoration`.

Inline live rendering should reject layout-changing properties such as
`display`, width, height, margins, padding, overflow, and arbitrary line
height, even if some remain appropriate inside a sandboxed block preview.
They can move text away from its source position or break the no-layout-churn
editing contract.

Special inline elements require explicit features:

- `<a>` needs controlled URL activation and link-graph integration;
- `<img>` should converge with the existing image asset and atomic-widget
  pipeline;
- `<br>` needs an explicit visual-break and caret policy;
- interactive, embedded, executable, or document-level tags do not enter the
  editor DOM.

---

## 7. HTML and Electron security boundary

Local Markdown is content, not application code. A repository, downloaded
archive, synced workspace, or Agent-authored file may be untrusted even when it
is local.

### 7.1 Main editor DOM

No Markdown trust mode may inject arbitrary HTML into the CodeMirror DOM.

- Event-handler attributes are always rejected.
- Scriptable and document-level tags are always rejected.
- URLs are protocol-checked and activated through product-controlled handlers.
- CSS properties and values are separately allowlisted.
- Unsupported HTML remains visible source.
- Renderers construct approved DOM/decorations from typed policy output; they
  do not concatenate HTML strings.

### 7.2 HTML blocks

Safe mode renders a sanitized, non-executable subset.

`localTrusted` may enable a richer block preview only inside a sandboxed iframe
with a narrow capability set. It must not grant the same capability to inline
HTML or expose preload/Electron APIs to the frame.

Navigation, popup, download, form, and message handling require explicit host
policies. CSP, Electron sandboxing, context isolation, and HTML sanitization
are defense-in-depth layers; none replaces the others.

### 7.3 Sanitizer ownership

The sanitizer and policy are shared infrastructure. Table cells, HTML blocks,
live inline HTML, read-only preview, and export may not maintain independent
allowlists.

A maintained sanitizer library may provide structural HTML sanitization, while
PuppyOne retains product-specific URL, asset, and CSS validation. If a custom
sanitizer remains, it requires a dedicated adversarial test corpus and regular
security review.

---

## 8. Product architecture patterns and PuppyOne's choice

Markdown products generally fall into three architecture families.

### 8.1 Source editor plus separate preview

Example: VS Code's Markdown source editor and markdown-it preview.

- Canonical model: Markdown source.
- Preview: separately parsed and rendered HTML.
- Strengths: simple editing model, mature preview pipeline, easy source
  fidelity.
- Costs: editing and reading happen in different surfaces; renderer drift is
  possible unless dialect fixtures are shared.

### 8.2 Source-first live preview

Example family: Obsidian's CodeMirror-based editor and Typora-class live
preview behavior.

- Canonical model: Markdown source.
- View: source ranges styled or replaced through editor-native decorations.
- Strengths: source fidelity, file interoperability, direct diffs, and a
  rendered-first editing experience.
- Costs: caret behavior, nesting, composition, and range mapping require a
  rigorous semantic and interaction layer.

This is PuppyOne's chosen family.

### 8.3 Structured rich-text model with Markdown serialization

Example: ProseMirror/Milkdown.

- Canonical model while editing: a schema-constrained document tree.
- Input/output: Markdown parser and serializer.
- Strengths: strong WYSIWYG behavior, schema validation, rich transactions,
  and collaboration primitives.
- Costs: serialization can normalize or lose source details, raw HTML and
  unknown syntax require schema support, and exact source round-trip is more
  difficult.

PuppyOne should choose this family only if product requirements change so that
Word-like rich editing and normalized output matter more than preserving the
original Markdown as an Agent- and Git-friendly artifact.

The universal rule across all three families is not that every product must
use the same editor library. It is that a product must have exactly one
canonical mutable document model and explicit parser, policy, and renderer
boundaries.

---

## 9. Performance and incremental behavior

Architecture correctness must not require full-document DOM rendering on each
keystroke.

- Use Lezer's incremental tree and CodeMirror transactions as the primary
  invalidation signal.
- Rebuild semantic projections only for changed blocks plus structural
  neighbors when possible.
- Cache by document identity and explicit context inputs, never by mutable DOM.
- Use viewport-only computation for decorations that cannot affect vertical
  layout.
- Provide block replacements that affect layout directly to CodeMirror so
  viewport measurement remains correct.
- Debounce expensive asynchronous renders such as Mermaid, but keep the source
  transaction synchronous.
- Version asynchronous results so stale asset, Mermaid, or HTML results cannot
  replace newer content.

Correctness comes before incremental optimization. A full semantic rebuild is
an acceptable first implementation if its contract allows later incremental
replacement and documents the file-size boundary.

---

## 10. Conformance and test strategy

The primary regression defense is a shared fixture matrix. Each fixture should
state:

- Markdown source;
- expected syntax classification;
- expected normalized semantic elements and ranges;
- policy result;
- collapsed live behavior;
- revealed live behavior where applicable;
- read-only preview meaning;
- expected fallback or diagnostic;
- saved source after an explicit edit.

Minimum inline HTML fixtures:

- a styled `<span>` inside a list item;
- the same span at paragraph start and mid-paragraph;
- adjacent and nested spans;
- Markdown emphasis inside a span;
- Unicode/CJK content and quoted attributes;
- unclosed, mismatched, and malformed tags;
- void tags;
- `onclick`, `javascript:`, CSS `url()`, `expression()`, and blocked tags;
- unsupported attributes and layout-changing styles;
- caret positions at `from`, strictly inside, and `to`;
- range selection across the element;
- copy, paste, undo, Backspace, and IME composition;
- safe and `localTrusted` modes;
- light and dark themes.

Cross-surface fixtures must prove that a construct does not work in a table
cell while failing in a list item, or work in read-only preview while exposing
raw source in live preview without an intentional documented fallback.

Tests should be split into:

1. pure parser/semantic/policy unit tests;
2. decoration-range tests without screenshots;
3. DOM security tests;
4. editor interaction tests;
5. a small visual regression suite for layout and theme behavior.

---

## 11. Proposed module boundaries

The target organization is conceptual; migration should avoid a large-bang
rename.

```text
vendor/shared-ui/src/editor/markdown/
  parser/
    markdownParserExtensions.ts
    markdownDialect.ts
  semantic/
    markdownSemanticDocument.ts
    markdownSemanticTypes.ts
    inlineHtmlModel.ts
    htmlTagTokenizer.ts
  policy/
    markdownHtmlPolicy.ts
    markdownUrlPolicy.ts
    markdownAssetPolicy.ts
  features/
    headings/
    lists/
    links/
    images/
    inline-html/
    html-blocks/
    tables/
    code-blocks/
    mermaid/
  adapters/
    codemirror/
      livePreviewDecorations.ts
      interactionState.ts
      editingCommands.ts
    preview/
      markdownPreviewRenderer.ts
    indexing/
      markdownLinkGraph.ts
  tests/
    fixtures/
```

Existing modules should move only when a migration step materially clarifies
ownership. The architecture can first be enforced through APIs and tests while
files remain in their current directories.

---

## 12. Current gaps this architecture must close

This is a characterization of the current implementation, not an instruction
to fix it before this draft is approved.

1. `markdownElements.ts` is a partial semantic model, but its construct list is
   not exhaustive across renderers.
2. Main-editor inline decorations, table-cell inline rendering, and HTML block
   rendering have different capability paths.
3. HTML block discovery reparses raw lines and treats any line-start HTML tag
   as a block instead of using the parser's block/inline classification.
4. The HTML policy already allows more layout-changing CSS than is appropriate
   inside an editable inline surface.
5. Whole-element occupied ranges prevent some legitimate nested inline marks.
6. Feature completeness is not enforced by a registry, exhaustive switch, or
   shared fixture matrix.
7. Desktop hides the global source-view switch, increasing the importance of
   honest per-element reveal and unsupported-source fallback.

---

## 13. Proposed migration sequence

Implementation begins only after this draft and its open decisions are
accepted.

### Phase 0 — approve the contract

- Review this architecture with the Live Preview UX specification.
- Decide the initial inline HTML tag/style allowlist.
- Decide whether global source mode remains hidden on Desktop.
- Agree on the safe behavior for partially supported inline HTML.

### Phase 1 — characterization tests

- Record current behavior for headings, lists, nested Markdown, HTML blocks,
  table cells, and inline HTML.
- Add parser-tree fixtures proving `HTMLBlock` versus paragraph `HTMLTag`.
- Add security fixtures before changing rendering.

### Phase 2 — semantic and policy boundaries

- Introduce the normalized inline HTML model and shared HTML tag tokenizer.
- Separate inline editor CSS policy from block-preview CSS policy.
- Add exhaustive feature/render coverage checks.
- Preserve current visible behavior except where required to expose an honest
  unsupported fallback.

### Phase 3 — inline HTML live preview

- Add safe inline marks and hidden/revealed tag markers.
- Support nesting with Markdown marks.
- Add caret, selection, copy, undo, and IME tests.
- Ship the motivating `<span style="color: ...">` list-item case.

### Phase 4 — converge duplicate render paths

- Make table cells and read-only preview consume the same semantic/policy
  contract.
- Replace line-start HTML block guessing with parser classification.
- Keep block HTML sandbox behavior behind the shared policy boundary.

### Phase 5 — hardening and incremental optimization

- Add adversarial sanitizer coverage and visual regression tests.
- Profile large documents and introduce range-local semantic invalidation if
  needed.
- Remove superseded scanners and compatibility branches only after fixture
  parity is proven.

Each phase must be independently shippable and preserve source round-trip.

---

## 14. Acceptance criteria for the architecture migration

The migration is complete when:

- Markdown source remains the only mutable document model.
- Parser context, not line-start heuristics, owns block/inline classification.
- Every supported construct has one normalized semantic representation.
- Main live preview, table cells, and read-only preview share dialect and
  policy decisions.
- Adding a semantic kind without a renderer or fallback fails CI.
- Unsafe inline HTML cannot enter the editor DOM.
- Unsupported and malformed syntax remains visible and editable.
- Nested Markdown and inline HTML render without discarding either mark.
- Source is unchanged unless the user, Agent, or explicit command edits it.
- The Live Preview UX caret, reveal, selection, and no-layout-churn contract
  remains satisfied.

---

## 15. Open decisions before implementation

1. Should the first inline HTML release support only same-block paired tags, or
   include tags spanning soft line breaks within a paragraph?
2. Should unsupported attributes cause the whole inline element to remain
   source-visible, or should PuppyOne render the safe subset with a diagnostic?
3. Which inline styles are product requirements beyond `color`,
   `background-color`, `font-weight`, `font-style`, and `text-decoration`?
4. Should Desktop expose a global source-mode shortcut even when the preview
   header is hidden?
5. Should structural sanitization use a maintained sanitizer library with
   PuppyOne-specific policy layered on top, or retain the custom DOM
   reconstruction sanitizer with a dedicated security corpus?
6. Is semantic authoring syntax needed for product concepts such as
   "team-provided content," so durable documents do not depend on hard-coded
   presentation colors?

---

## 16. References

- [CommonMark specification](https://spec.commonmark.org/)
- [GitHub Flavored Markdown specification](https://github.github.com/gfm/)
- [CodeMirror decorations](https://codemirror.net/examples/decoration/)
- [CodeMirror reference manual](https://codemirror.net/docs/ref/)
- [Obsidian editor extensions and decorations](https://docs.obsidian.md/Plugins/Editor/Decorations)
- [Typora HTML support](https://support.typora.io/HTML/)
- [VS Code Markdown extensions](https://code.visualstudio.com/api/extension-guides/markdown-extension)
- [ProseMirror guide](https://prosemirror.net/docs/guide/)
- [ProseMirror Markdown example](https://prosemirror.net/examples/markdown/)
- [Milkdown](https://github.com/Milkdown/milkdown)
- [OWASP Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
