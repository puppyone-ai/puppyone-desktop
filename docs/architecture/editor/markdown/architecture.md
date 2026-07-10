# Markdown Editor Architecture

Status: **Adopted architecture; core and vertical-feature migration landed as
of 2026-07-11.** URL/sanitizer closure, plan-backed block widgets, the
policy-converged isolated preview adapter for table cells, a dedicated
`markdownAssetPolicy` +
hardened `AssetBroker` (policy-before-resolver, concurrency limit, principal
handle revocation, no raw `file://`), host-injected workspace identity facets
with a single `createPrincipalFromView` helper, `DocumentTrustContext` +
`AuthorizationGrant` gating of local active HTML, revision-bound
`ExecutionSession`s, recoverable code/Mermaid/table drafts, revision-scoped
Electron WebEmbed sessions, typed feature registries, and atomic table
interaction/focus coordination are landed on the migration branch. The remaining
acceptance gaps are full document-plan convergence for the isolated table-cell
preview, a visual regression suite, incremental large-document decoration
updates, and browser-backed (real renderer) lifecycle/IME/sandbox coverage —
not product polish. These are enumerated honestly in §12 and Phase 4–6 below.

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

1. The CodeMirror document string is the only canonical, committed document
   truth while a file is open. The file on disk remains plain Markdown.
2. A CommonMark/GFM-compatible incremental parser derives syntax from that
   source.
3. A normalized semantic document derives product-level elements, source
   ranges, nesting, and edit metadata from the syntax tree.
4. A policy compiler turns raw semantic elements into safe render plans.
5. Live editing, read-only preview, export, indexing, and other consumers are
   adapters over the same semantic contract. They may not reinterpret the
   Markdown independently.
6. All committed user actions become CodeMirror transactions against the
   source. A rendered DOM node or widget is never a second canonical or
   independently persisted document model.
7. Ordinary Markdown uses an Obsidian-style broad sanitized HTML profile by
   default. Safe presentation does not require document trust; trust gates
   active execution and broader resource capabilities, not whether a harmless
   `<span style="color: ...">` can render.

The end-to-end Markdown data flow is:

```text
+-----------------------------+
| Markdown source             | <-------------------------------+
| only committed document     |                                 |
+-----------------------------+                                 |
              |                                                 |
              | CodeMirror transaction                          |
              v                                                 |
+-----------------------------+                                 |
| Incremental syntax parser   |                                 |
| Lezer + PuppyOne dialect    |                                 |
+-----------------------------+                                 |
              | derived and immutable                           |
              v                                                 |
+-----------------------------+                                 |
| Normalized semantic model   |                                 |
| kind + range + metadata     |                                 |
+-----------------------------+                                 |
              |                                                 |
              v                                                 |
+-----------------------------+                                 |
| Policy compiler             |                                 |
| HTML + URL + asset + trust  |                                 |
+-----------------------------+                                 |
              | typed safe plan                                 |
              v                                                 |
+-----------------------------+                                 |
| Markdown element plan       |                                 |
+-----------------------------+                                 |
       |              |                |                         |
       v              v                v                         |
 Live editor     Read-only        Export / index                 |
 decorations    preview                                       |
       |                                                        |
       +---------- user command + transaction ------------------+
```

The loop back to source is deliberate: rendered DOM never becomes a second
document. Every committed user action returns through a CodeMirror command and
transaction.

This is the source-first family used by Markdown-native editors. It is a
better fit for PuppyOne than making a rich-text tree the canonical model,
because PuppyOne must preserve files for Agents, diffs, version history,
external tools, and source-level interoperability.

Implementation baseline:

- `features/html/htmlTagTokenizer.ts` is the shared quote-aware HTML tag tokenizer.
- `features/html/inlineHtmlModel.ts` pairs parser-recognized inline tags into
  range-preserving semantic elements.
- `features/html/inlineHtmlPolicy.ts` compiles the non-executable editor subset.
- `core/decorations/inlineDecorations.ts` renders approved content with CodeMirror
  marks and hides or reveals only source marker ranges.
- `core/decorations/livePreviewDecorations.ts` rebuilds when CodeMirror publishes a
  newer incremental syntax tree; semantic caches are keyed by both document
  and syntax-tree identity so partial initial parses cannot become permanent.
- `features/html/htmlBlockModel.ts` uses Lezer `HTMLBlock` context rather than
  line-start guessing.
- `tests/markdownInlineHtml.test.ts` is the cross-layer conformance and
  security fixture suite for this feature.

---

## 2. Architectural invariants

These are correctness rules, not implementation preferences.

### 2.1 One canonical document model

Only the Markdown source is canonical, committed, and persisted. The syntax
tree, semantic document, render plan, decorations, widgets, link index, and
outline are derived state. An embedded draft may change while the user edits,
but it is editor-scoped, ephemeral interaction state and cannot be saved as an
independent document.

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

Policy is capability-oriented rather than path-oriented. It should preserve as
much safe structure and presentation as possible while removing executable or
privileged capabilities. A file being local does not enable scripts, and a file
being imported or synced does not disable harmless sanitized formatting.

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
- external document updates.

The `EditorView` input adapter and browser DOM events own the live composition
lifecycle. Interaction state may mirror composition through effects so
decoration decisions are transaction-visible, but the source layer does not
claim an independent composition truth.

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

- versioned broad-safe HTML tag, attribute, CSS, media, and embed profiles;
- per-surface CSS property/value validation and containment;
- safe link protocols and controlled link activation;
- image source validation and workspace asset resolution;
- provenance-based `DocumentTrustContext` evaluation and explicit capability
  grants;
- block-versus-inline execution boundary;
- structured rejection reasons.

The compiler returns typed safe data, not HTML strings:

```ts
type SafeInlineHtmlMark = {
  kind: "inlineHtmlMark";
  profile: "inline-editable";
  tagName: SafeInlineTagName;
  attributes: SafeInlineAttributes;
  style: SafeInlineStyle;
  diagnostics: readonly MarkdownDiagnostic[];
};

type HtmlPolicyResult<T> =
  | { supported: true; value: T }
  | { supported: false; reasons: readonly string[] };
```

The live editor adapter must not receive arbitrary event attributes, raw style
text, or executable HTML. `DocumentTrustContext` does not gate the broad-safe
presentation profile; it contributes only when a plan requests active
execution, external navigation/network, or elevated ambient authority. A
brokered passive read of a workspace-scoped asset is a baseline rendered-data
capability; it does not give document content filesystem authority.

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

- a transaction-visible mirror of composition plus rendered and revealed
  lifecycle coordination;
- per-element inline reveal;
- atomic hidden-marker navigation;
- block selection and embedded-widget focus;
- source-preserving deletion and conversion commands;
- IME-safe update scheduling.

Interaction state refers to semantic element ranges. It must not infer element
identity from CSS classes or rendered DOM ancestry.

### 3.7 Source layout and feature composition

The implementation is a hybrid modular monolith. Stable editor machinery is
organized by layer; complex Markdown capabilities are vertical features:

```text
editor/markdown/
  MarkdownCodeMirrorEditor.tsx         public editor surface
  markdownCodeMirrorExtensions.ts      public CodeMirror assembly
  core/                                source, syntax, plans, commands, adapters
  features/
    blockFeatureRegistry.ts            block-widget composition boundary
    inlineFeatureRegistry.ts           inline-widget composition boundary
    table/                              model + plan + commands + focus + widget
    html/                               tokenizer + model + plan + policy + widget
    code-block/                         model + plan + widget
    mermaid/                            renderer + widget
    image/                              model + plan + widget
  platform/                            policy, brokers, sessions, CM host adapters
  shared/                              feature-agnostic DOM/measure primitives
```

The core may consume a feature's pure model or plan compiler, but it constructs
concrete feature widgets only through the typed registries. `platform/` never
imports a feature, and `shared/` imports none of `core/`, `features/`, or
`platform/`. `scripts/check-markdown-architecture.mjs` enforces these durable
boundaries in CI.

A feature widget is a rendering adapter, not a controller. Widget construction
must not dispatch. Event handlers call feature commands; commands issue one
atomic CodeMirror transaction; editor-scoped coordinators perform DOM work only
after CodeMirror has committed its view update.

### 3.8 Dependency direction: current state and target

The physical folders are intentionally clearer than the old horizontal layout,
but `core/` still contains both stable contracts and application composition.
That creates a **folder-level two-way dependency**:

```text
Current transitional dependency

       +---------------------------------------+
       | core/                                 |
       | contracts + compiler + decorations    |
       +---------------------------------------+
                    |                 ^
                    | imports         | imports contracts
                    v                 |
       +---------------------------------------+
       | features/                             |
       | feature plans + commands + widgets    |
       +---------------------------------------+
```

For example, `core/plans/markdownPlanCompiler.ts` imports the table, HTML,
image, and code-block plan compilers, while those feature plan compilers import
`core/plans/markdownPlanTypes.ts` and plan primitives. This is not currently a
dangerous runtime module cycle: most edges back to core are types or leaf
helpers. It does mean that the directory named `core` is not yet an independent
kernel and that moving or testing it in isolation remains harder than necessary.

The long-term one-way dependency should be:

```text
                         +-----------------------+
                         | Public assembly       |
                         +-----------------------+
                                    |
                                    v
                         +-----------------------+
                         | Composition           |
                         | knows all features    |
                         +-----------------------+
                           |        |         |
                           v        v         v
                    +----------+ +----------+ +----------+
                    | Adapters | | Features | | Platform |
                    +----------+ +----------+ +----------+
                         |        /    |    \       |
                         |       /     |     \      |
                         v      v      v      v     v
                    +----------------+   +----------------+
                    | Kernel         |   | Shared         |
                    | contracts only |   | primitives     |
                    +----------------+   +----------------+

Allowed dependency direction:

  Public assembly  ----> Composition
  Composition      ----> Adapters / Features / Platform / Kernel
  Adapters         ----> Features / Platform / Kernel / Shared
  Features         ----> Platform ports / Kernel / Shared
  Platform         ----> Kernel contracts only
  Kernel           ----> no outer layer
  Shared           ----> no outer layer
```

The important rule is not that features know nothing about shared contracts.
They must know the contracts they implement. The rule is that the kernel never
imports a concrete table, HTML, image, or Mermaid implementation. A dedicated
composition layer imports both sides and connects them.

### 3.9 Type constraints and impossible states

The current semantic model ties `kind` and `blockData` only by convention:

```text
MarkdownStandardElement
  |
  +---- kind: table | image | fence | task | ...
  |
  +---- blockData?: TableData | ImageData | FenceData | TaskData | ...

TypeScript therefore cannot prevent:

  kind: table  +  blockData: ImageData
  kind: image  +  blockData: FenceData
  kind: fence  +  blockData: undefined
```

Feature plan compilers defend against those combinations at runtime, but the
stronger target is a fully discriminated union:

```text
MarkdownElement
  |
  +---- TableElement
  |       kind: table
  |       blockData: TableData
  |
  +---- ImageElement
  |       kind: image
  |       blockData: ImageData
  |
  +---- FenceElement
          kind: fence
          blockData: FenceData
```

With that model, invalid combinations fail during compilation instead of
requiring repeated `blockData.kind` checks in every feature. This is what
"type constraints can still be strengthened" means in the architecture review.

### 3.10 Transaction and widget lifecycle

"Transaction and widget lifecycle follows best practice" means that ownership
and update timing are explicit:

```text
User click / key / drag
          |
          v
Widget event handler
          |
          | typed operation
          v
Feature command
          |
          | ONE transaction containing:
          | source change + selection + state effects
          v
CodeMirror EditorView
          |
          +----> update canonical EditorState
          |
          +----> rebuild or reuse widget DOM
          |
          +----> publish ViewUpdate
                         |
                         v
              Editor-scoped coordinator
                         |
                         | next animation frame / after commit
                         v
              restore logical DOM focus
                         |
                         v
              clear the matching request token
```

The forbidden path is:

```text
Widget.toDOM()
      |
      +----> view.dispatch()        INVALID: view update may be in progress
```

`WidgetType` values are immutable descriptors. Timers, observers, listeners,
abort controllers, asset handles, edit sessions, and execution sessions belong
to the mounted widget session and have deterministic disposal. Revision-bound
async work cannot commit into a newer source revision. This does not mean every
widget operation is already optimal—for example, table descriptor equality can
still become cheaper—but the transaction timing and resource ownership model is
the correct one.

---

## 4. Render-plan boundary

The semantic document should not directly construct decorations or DOM. A
small render-plan boundary keeps product semantics independent of the view
technology.

The compiler produces one plan per semantic element. Capabilities belong to
the compiled element instance, not only to its syntax kind:

```ts
type MarkdownElementPlan =
  | {
      presentation: "visibleSource";
      sourceRange: SourceRange;
      diagnostics: readonly MarkdownDiagnostic[];
      capabilities: { reveal: false; atomic: false; deleteUnits: readonly [] };
    }
  | {
      presentation: "inlineMark";
      sourceRange: SourceRange;
      contentRange: SourceRange;
      markerRanges: readonly SourceRange[];
      mark: TypedContentMark;
      capabilities: InlineMarkCapabilities;
    }
  | {
      presentation: "inlineAtom";
      sourceRange: SourceRange;
      atom: InlineAtomModel;
      layout: { lineBreaks: number; estimatedHeight?: number };
      capabilities: AtomicInlineCapabilities;
    }
  | {
      presentation: "blockAtom";
      sourceRange: SourceRange;
      embed: BlockEmbedModel;
      layout: { estimatedHeight: number };
      capabilities: BlockEmbedCapabilities;
    };
```

The same semantic element and policy result should produce equivalent content
across adapters, even though a live adapter uses source ranges and a read-only
adapter uses DOM nodes.

Plan invariants:

- Incomplete, malformed, semantically ambiguous, or wholly unrenderable syntax
  compiles to `visibleSource` and therefore has no collapsed-marker deletion
  capability.
- A conventional element with rejected attributes may still compile to a
  broad-safe plan when removing those capabilities preserves its text and
  structural meaning. The plan records diagnostics, source reveal always shows
  the exact attributes, and a security-sensitive element whose meaning depends
  on a rejected capability falls back to source or an explicit placeholder.
- A source range has at most one replacement plan. Hiding source and drawing an
  atom may not create overlapping `Decoration.replace` values for the same
  range.
- `atomicRanges`, reveal behavior, Backspace/Delete units, and source fallback
  all consume the same compiled plan. Keymaps do not infer these capabilities
  again from an element kind.
- Layout metadata is explicit. An inline widget that introduces a visual line
  break reports `lineBreaks`; a block or tall inline atom supplies a reasonable
  height estimate and requests measurement after its real size changes.
- The plan contains typed, policy-approved values. It does not expose arbitrary
  HTML, raw event attributes, unvalidated URLs, or uncompiled CSS to adapters.

### 4.1 Embedded component host

Atomic inline content and complex blocks use a per-`EditorView`
`MarkdownEmbedHost`:

```text
Markdown source
      |
      v
Semantic range index + policy context
      |
      v
Compiled render-plan index
      |
      +--> direct structural decorations
      |      block atoms / line-affecting atoms / atomic ranges
      |
      +--> viewport presentation decorations
      |      proven layout-neutral marks and visual state
      |
      +--> MarkdownEmbedHost (one per EditorView)
             DOM sessions / measurement / async work / focus routing /
             draft editing surfaces
```

The host is an adapter runtime, not a second document model. It owns ephemeral
DOM and asynchronous state while all committed edits still become CodeMirror
transactions against Markdown source.

Embed isolation is also a compiled decision, not a widget convention:

- ordinary images, controls, and policy-approved marks use typed host DOM;
- sanitized SVG or HTML may use typed/sanitized DOM only when its sanitizer is
  an explicit security boundary with adversarial coverage;
- non-executable rich content that needs isolated layout uses an opaque-origin
  sandbox with explicit capabilities;
- an explicit external `https` web embed may run the remote site's code only in
  a `WebEmbedBroker`-created sandboxed external-origin web-contents surface with
  no workspace, document, preload, Node, or raw IPC authority; its resource
  loading follows the workspace's web-embed and privacy policy;
- Markdown-supplied scripts, `srcdoc`, and local executable HTML are not allowed
  in an ordinary iframe mounted inside the editor renderer. Any future local
  executable-content product must use a disposable, process-isolated surface
  with its own session, quotas, and watchdog;
- Shadow DOM may be used for style containment, but it is not a security
  boundary and does not upgrade untrusted content to typed host DOM.

### 4.2 Widget descriptor and DOM-session lifecycle

`WidgetType` is an immutable, cheap description of what should be drawn. It is
not the owner of a mounted DOM component. CodeMirror may create a new descriptor
and reuse an existing DOM node when `eq()` returns true.

Consequences:

- A widget descriptor may contain immutable render-plan data and a stable
  render key.
- `ResizeObserver`, event subscriptions, timers, `AbortController`, async
  generation counters, theme listeners, and edit drafts may not be owned only
  by descriptor instance fields.
- `toDOM()` mounts a DOM-owned `WidgetSession`, registered by DOM element or by
  the per-view host. `destroy(dom)` disposes the session associated with that
  exact DOM node, even if the descriptor instance has changed.
- `eq()` compares immutable plan identity. `updateDOM()` may update that
  widget's own DOM, but may not inspect surrounding CodeMirror DOM as a source
  of semantic state.
- Mount, DOM reuse, viewport removal, remount, reconfiguration, and editor
  destruction must each have deterministic cleanup behavior.

An illustrative session boundary is:

```ts
type WidgetSession = {
  dom: HTMLElement;
  generation: number;
  dispose(): void;
};

type WidgetSessionRegistry = {
  byDom: WeakMap<HTMLElement, WidgetSession>;
  active: Set<WidgetSession>;
  disposeAll(): void;
};
```

The weak map supports exact DOM lookup; the per-view enumerable set is required
to abort and dispose every live session when the editor is destroyed. A weak
map alone is not a complete lifecycle registry.

### 4.3 Embedded edit sessions and transaction bridge

Code blocks, Mermaid, tables, and future interactive embeds may keep a staged
draft, but the draft is recoverable interaction state rather than canonical
document state:

```ts
type EmbeddedEditSession = {
  elementId: string;
  featureId: string;
  mappedRange: SourceRange;
  baseSource: string;
  baseRevision: string;
  draft: unknown;
  mode: "preview" | "editing" | "source";
  focusTarget?: unknown;
};
```

- The recoverable draft, mapped range, base revision, mode, and focus intent
  have exactly one owner: an editor-scoped StateField or equivalent per-view
  session store updated through editor effects. A DOM session is only a view of
  that state and may hold a transient native IME buffer, never the only
  recoverable draft.
- Sessions are scoped to one `EditorView`; module-global pending focus or draft
  state is forbidden.
- Ranges map through transactions. A commit verifies that the current source
  still matches the session's base source or performs an explicit rebase or
  conflict flow.
- The commit builder dispatches the source change and the selection mapped into
  the new document in one transaction. DOM callbacks do not dispatch a change
  and then reuse stale pre-change offsets.
- Unrelated edits, Agent edits, external synchronization, undo/redo, and widget
  virtualization must not silently discard an active draft.
- The outer editor history records committed source transactions. A nested
  editor may keep temporary draft history, but it does not write directly to
  disk or maintain a second saved document.

### 4.4 Capability brokers

Embedded renderers receive narrow host capabilities instead of ambient browser
or Electron authority:

- Every broker request carries a `CapabilityPrincipal`: editor view, workspace,
  document and revision, execution session when applicable, and a narrow
  purpose/audience. Electron's `ProtocolRequest` does not expose a trustworthy
  requesting `WebFrameMain`, so a custom-protocol URL is deliberately modeled
  as a narrow bearer capability, not mislabeled as a non-transferable frame
  identity. It is issued only through trusted main-frame IPC, unique for each
  Markdown asset lease, bound to sender/resource/purpose, opaque (no workspace
  path), checked against the trusted app origin and open workspace on every
  fetch, and hard-revoked on handle/session/sender disposal. A future surface
  that requires non-transferability must stream through sender-authenticated
  IPC/MessagePort rather than placing that authority in a URL.
- `AssetBroker` enforces asset policy and returns typed, revocable handles.
  Workspace-relative, non-executable assets inside the open workspace are part
  of the default broad-safe profile; they still use scoped broker handles and
  never raw `file://` access. The broker canonicalizes and resolves the real
  path, checks containment using platform filesystem semantics, handles case and
  aliases, rejects path traversal, escaping symlinks, directories, devices,
  sockets, and other special files, opens the file itself, and revalidates the
  opened handle before streaming so validate-then-swap cannot escape the root.
  Real filesystem paths are never exposed to document content.
- Asset response policy revalidates redirect targets, verifies actual MIME and
  sink compatibility, streams through a hard byte limit even without a
  trustworthy `Content-Length`, limits concurrency and lifetime, and supports
  cancellation/disposal. Remote loads default to denied unless policy grants
  them; data URLs are limited before and after decoding; SVG uses its own
  sanitizer profile.
- Blob URLs are only origin/storage-partition scoped and are not exact-principal
  capabilities. If used, they are created inside the target isolated realm,
  remain subject to MIME/sink/sanitizer checks, and are revoked with that realm.
  Local asset URLs remain the narrow, hard-revocable bearer leases described
  above; neither form is described as frame-bound authority.
- `LinkBroker` converts a typed link intent into internal navigation, controlled
  external opening, a confirmation, or denial.
- `WebEmbedBroker` asks the main process to create, attach, position, and destroy
  isolated web contents under a named privacy profile; Markdown widgets never
  create authority-bearing browser surfaces directly.
- `AsyncRenderBroker` owns request keys, in-flight deduplication, concurrency,
  timeout, cancellation, stale-result suppression, cache policy, and last-good
  results.
- `TransactionBroker` resolves the current element/session, validates its base
  revision, and creates the source transaction.
- `DocumentTrustContext` derives a revocable `AuthorizationGrant` from
  workspace/document provenance, requested capability, policy version, and
  explicit user authorization. The grant may survive ordinary edits and a file
  being local is not itself a grant.
- Each active renderer has a separate `ExecutionSession` bound to an exact
  document revision, capability principal, process/partition, and frame. A
  source revision change destroys that execution session and recompiles or
  restarts it under the still-valid authorization grant without prompting again.

Capability-bearing URLs, HTML, asset handles, and asynchronous results may not
be cached or deduplicated across principals. Only authority-free pure results,
such as a validated Mermaid SVG, may be shared when its key includes source,
sanitizer, policy, and renderer versions. Authorization revocation destroys all
derived execution sessions and handles. Revision change or session disposal
destroys only the affected revision-bound sessions, aborts their jobs, revokes
their handles, and evicts their principal-scoped cache entries immediately; it
does not revoke the user's persistent authorization grant.

### 4.5 StateField and ViewPlugin ownership

State fields own source-mapped and layout-relevant state:

- block replacements and inline atoms that affect line structure or height;
- hidden marker replacements and their atomic ranges;
- the mirrored composition state, reveal, expanded atom, embed session, and
  mapped focus state;
- an explicit dependency key covering document, syntax tree, dialect, policy,
  trust, resolver context, composition, reveal, expansion, and edit session.

View plugins and the embed host own view-local behavior:

- viewport-only marks proven not to change glyph metrics, line wrapping, line
  height, block geometry, or viewport measurement. A `Decoration.mark` is not
  automatically layout-neutral; font weight, font style, font family, size,
  spacing, and similar styles remain direct when they can change wrapping;
- DOM event routing and visual selection chrome;
- DOM sessions, observers, theme subscriptions, async mount/unmount, and
  coalesced `requestMeasure()` calls;
- no canonical content and no unique copy of an uncommitted draft.

---

## 5. Markdown feature contract

Every supported Markdown construct is delivered as a complete feature bundle.
The exact TypeScript API may differ, but the ownership must be explicit:

```ts
interface MarkdownFeature<Semantic, Plan extends MarkdownElementPlan> {
  id: string;
  syntax?: readonly MarkdownConfig[];
  normalize: MarkdownSemanticNormalizer<Semantic>;
  compile: MarkdownPlanCompiler<Semantic, Plan>;
  live: MarkdownLiveAdapter<Plan>;
  preview: MarkdownPreviewAdapter<Plan>;
  commands?: MarkdownCommandAdapter<Plan>;
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
6. security and capability policy where applicable;
7. DOM/runtime lifecycle behavior for embedded content;
8. fixtures proving cross-context consistency.

The semantic union and renderers should use exhaustive TypeScript switches or
an equivalent registry check. Adding a new semantic kind without assigning a
renderer must fail a test or type check instead of silently becoming plain
source in one surface.

Feature bundles are an ownership discipline, not necessarily a runtime plugin
system. Built-in features should use a static, exhaustively checked registry;
they may remain statically imported. Dynamic third-party plugin loading is a
separate product decision and is not required to obtain these boundaries.

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

Malformed, ambiguous, or capability-reduced:

- malformed or semantically ambiguous source remains visible;
- a conventional element may keep its safe text and structure after blocked
  attributes are omitted from the render plan;
- no unsafe attribute or behavior is applied, and a diagnostic plus per-element
  reveal exposes what was reduced;
- if reduction would misrepresent the element, source or a typed placeholder is
  shown instead;
- switching to source mode always exposes the exact file content.

### 6.4 Broad sanitized HTML compatibility

PuppyOne adopts an **Obsidian-style broad sanitized HTML strategy**. This is a
product behavior decision, not a claim of byte-for-byte compatibility with
Obsidian's undocumented exact sanitizer behavior or profile:

- conventional, non-executable HTML should render by default in ordinary
  Markdown, regardless of whether the file was created locally, imported,
  cloned, synced, or written by an Agent;
- the policy removes capabilities instead of requiring trust for harmless
  presentation;
- unsupported source becomes visible only when PuppyOne cannot preserve an
  honest safe representation;
- profiles are versioned and centrally tested so live editing, table cells,
  read-only preview, and export do not drift.

The broad-safe family contains:

- `inline-editable`: common semantic and presentational inline elements such as
  spans, emphasis variants, underline/strike, `mark`, `small`, `code`, `kbd`,
  quotations, citations, ruby annotations, sub/superscript, time, and safe
  anchors;
- `safe-block`: common document structure such as paragraphs, sections,
  headings, lists, blockquotes, `div`, `details`/`summary`, figures, preformatted
  content, and tables;
- `safe-media`: currently only images, compiled to typed atoms whose every
  `src`/`srcset` candidate resolves through `AssetBroker`. Audio/video/source
  join this profile only after equivalent typed resource and lifecycle
  adapters ship; autoplay, capture, scriptable fallback, and unsanctioned
  remote loads are not baseline capabilities;

Adjacent capability-specific profiles are:

- `external-web-embed`: an explicit `https` iframe/embed intent compiled to an
  isolated widget rather than inserted as raw HTML;
- `svg-mermaid`: sanitized SVG output with its own stricter profile.

Representative safe attributes include language/direction, title, accessibility
metadata, dimensions subject to limits, and scoped class/id tokens. IDs and
classes are namespaced or contained so document content cannot address
application chrome. URL-bearing attributes are typed link, asset, or embed
intents; adapters never receive them as ambient browser authority.

Inline `style` is parsed declaration by declaration. The broad-safe policy may
support colors, typography, decoration, spacing, alignment, borders, and
contained block layout where the adapter can preserve editability. It rejects
external CSS loads, `url()` outside an approved asset intent, global/fixed
positioning, application-level selectors, unbounded geometry, and values that
escape the document container. Layout-affecting marks are direct decorations
and trigger measurement; properties that make editable content disappear are
shown in an edit-visible form with a diagnostic instead of hiding the source.

The following never enter the normal note DOM as executable capability:

- `script`, executable `style`/`link`, `meta`, `base`, `object`, `embed`, and
  similar document/application elements;
- `on*` event attributes, `javascript:`/`vbscript:` URLs, scriptable SVG, and
  unsanitized `srcdoc`;
- form submission, popup, download, top-navigation, raw IPC, preload, Node, or
  arbitrary filesystem capability.

### 6.5 Special element contracts

Broad compatibility does not bypass feature-specific interaction contracts:

- `<a>` activates only through `LinkBroker` and still participates in the link
  graph;
- `<img>` and supported media converge on the asset and atomic-widget pipeline;
- `<br>` compiles to exactly one typed atomic line-break plan. Because normal
  cursor motion cannot enter an atomic void range, it needs an explicit expand
  interaction such as selection plus Enter, a second click, or a source toggle;
  the widget reports one visual line break to CodeMirror;
- external `<iframe src="https://...">` becomes an isolated web-embed plan with
  workspace privacy/network policy; `srcdoc`, local executable HTML, and inline
  scripts do not take this path;
- forms, custom elements with behavior, and local HTML applications remain
  source-visible or use an explicit active-content product surface.

---

## 7. HTML and Electron security boundary

Local Markdown is content, not application code. A repository, downloaded
archive, synced workspace, or Agent-authored file may be untrusted even when it
is local.

### 7.1 Main editor DOM

No Markdown trust mode may inject arbitrary HTML into the CodeMirror DOM.

- The default broad-safe inline and block profiles render typed marks, atoms,
  or sanitized DOM without a trust prompt.
- Event-handler attributes are always rejected.
- Scriptable and document-level tags are always rejected.
- URLs are protocol-checked and activated through product-controlled handlers.
- CSS properties and values are compiled through the selected surface profile.
- Safe structure may remain rendered after a blocked capability is removed;
  source or a placeholder remains the fallback when that would be misleading.
- Renderers construct approved DOM/decorations from typed policy output; they
  do not concatenate HTML strings.

### 7.2 HTML blocks

Broad-safe block HTML is enabled by default. Common structure, tables, details,
figures, contained layout, and safe media do not require a
`DocumentTrustContext` grant; the renderer sanitizes them and keeps their source
fully recoverable.

External web embeds and local executable HTML are separate capabilities:

- An explicit `<iframe src="https://...">` may compile to an
  `external-web-embed` plan. Its safe default is blocked or click-to-load;
  automatic loading requires an explicit workspace privacy setting.
- `WebEmbedBroker` realizes a loaded external embed as main-process-created
  sandboxed `WebContents`/`WebContentsView` with a dedicated temporary storage
  partition. The default profile sends no persisted cookies or credentials and
  grants no permissions, workspace files, application origin, custom file
  protocol, preload, Node, or raw IPC access. Authenticated/persistent embeds,
  if ever supported, are a separate explicit browser profile.
- That temporary Electron `Session` enforces top-level URL, redirects, every
  subresource request, permissions, popup/window creation, downloads, and
  top/custom-protocol navigation. The embed host coordinates view bounds with
  editor scrolling and destroys the view when its DOM session is disposed.
- `srcdoc`, Markdown-supplied scripts, `file://`, workspace-local HTML that runs
  scripts, and other local applications are active content. They are disabled
  by default and require an explicit, revocable `AuthorizationGrant` tied to
  workspace/document provenance, capability, and policy version.
- Local active content never runs in an ordinary iframe in the editor renderer.
  If supported, the main process creates dedicated sandboxed
  `WebContents`/`WebContentsView` with a unique temporary partition and
  non-privileged origin, `nodeIntegration: false`,
  `nodeIntegrationInWorker: false`, `nodeIntegrationInSubFrames: false`, no
  preload, `sandbox: true`, `contextIsolation: true`, `webSecurity: true`, and no
  ambient Electron authority. The runtime verifies before loading content that
  its OS renderer process is not shared with the application renderer.
- A local active `ExecutionSession` is bound to one exact document revision.
  Editing destroys and, if the authorization grant remains valid, recompiles
  and restarts the session without another trust prompt.

Isolated surfaces require enforcement outside the HTML sanitizer:

- host-generated documents place a restrictive CSP before user content; user
  content cannot remove or weaken it. This CSP does not govern a cross-origin
  external page, whose requests are constrained by its dedicated Electron
  `Session` and its own response CSP;
- the main process enforces attachment, navigation, redirects, subresources,
  popups, downloads, permissions, and custom-protocol policy;
- isolated contents receive no host communication by default. A surface that
  needs host communication gets a separate, revocable `MessageChannel` session
  bound to its capability principal; every message validates sender/session,
  schema, purpose, size, and rate before invoking a broker;
- the host enforces source/input size, message and network byte/rate limits,
  load/render timeout, process memory/CPU monitoring, and an unresponsive
  watchdog that can kill and recreate the isolated process. It does not claim a
  reliable DOM-node quota inside arbitrary JavaScript;
- authorization revocation or privacy-policy changes destroy all derived
  contents. Document revision changes destroy only revision-bound execution
  sessions and may restart them under a still-valid authorization grant.

CSP, Electron sandboxing, context isolation, process isolation, host
interception, and HTML sanitization are defense-in-depth layers; none replaces
the others.

### 7.3 Sanitizer ownership

One central policy authority owns sanitizer profiles. Table cells, HTML blocks,
live inline HTML, read-only preview, export, and Mermaid may not invent private
renderer policies. The authority produces the named, non-escalating profiles
from section 6.4. Profiles may reuse validators but must not be merged into the
union of their permissions; each surface receives only its selected profile.

A maintained sanitizer library may provide structural HTML sanitization, while
PuppyOne retains product-specific URL, asset, and CSS validation. If a custom
sanitizer remains, it requires a dedicated adversarial test corpus and regular
security review.

URL validation canonicalizes before authorizing. It rejects C0/DEL control
characters and encoded control-character obfuscation, distinguishes document
paths from external URLs, parses external URLs with `URL`, and then applies a
protocol and host policy. All adapters use the same validator and `LinkBroker`.

Mermaid uses `securityLevel: "strict"`, disables HTML labels and click
callbacks, validates and limits source/output size, and treats the resulting
SVG sanitizer as a security boundary. The sanitizer removes executable/HTML/
animation elements, denies non-local paint references, preserves only fragment
references that resolve inside that SVG, and rewrites anchor navigation to an
inert `data-md-href` intent. The sanitized SVG mounts inside a ShadowRoot so its
generated CSS cannot style the editor document; link activation still exits
that boundary only through `LinkBroker`. Diagram features that require
arbitrary execution follow the separate process-isolated executable-content
rule in section 7.2. Images use `AssetBroker`; remote tracking loads, data URLs,
SVG, MIME, byte limits, concurrency, and privacy are explicit policy decisions
rather than consequences of an `http(s)` prefix.

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

### 8.4 HTML capability precedent

The broad-safe decision follows a common separation in mature Markdown tools:

- Obsidian sanitizes note HTML while supporting common inline styles,
  structure, and separate web-page embeds; executable community plugins use a
  different explicit trust channel.
- Typora renders broad conventional HTML but rejects document scripts and event
  handlers; script-based embeds run in a sandbox without access to writing
  content or local files.
- VS Code defaults Markdown preview to Strict, with scripts disabled even for
  local workspaces; workspace trust and preview execution security remain
  separate controls.
- GitHub accepts raw HTML syntax but filters dangerous tag families and applies
  further post-render sanitization.

PuppyOne therefore optimizes normal-note compatibility by widening sanitized
presentation, not by turning local Markdown into application code. The product
may differ in exact tags and UX, but it preserves the same capability split.

The universal rule across all three families is not that every product must
use the same editor library. It is that a product must have exactly one
canonical committed document model and explicit parser, policy, capability,
and renderer boundaries.

---

## 9. Performance and incremental behavior

Architecture correctness must not require full-document DOM rendering on each
keystroke.

- Use Lezer's incremental tree and CodeMirror transactions as the primary
  invalidation signal.
- Rebuild semantic projections only for changed blocks plus structural
  neighbors when possible.
- Cache by document identity, syntax-tree identity, and explicit context
  inputs, never by mutable DOM.
- Use viewport-only computation only for decorations proven not to affect glyph
  metrics, wrapping, line height, block geometry, or viewport measurement.
- Provide block replacements that affect layout directly to CodeMirror so
  viewport measurement remains correct.
- Debounce expensive asynchronous renders such as Mermaid, but keep the source
  transaction synchronous.
- Version asynchronous results so stale asset, Mermaid, or HTML results cannot
  replace newer content.
- Use one layout coordinator per `EditorView` to coalesce ResizeObserver and
  async-result measurements. Do not create an uncoordinated observer lifecycle
  in each replaceable widget descriptor.
- Key async work by feature, semantic element, source, theme, policy version,
  authorization-grant identity where applicable, exact execution revision, and
  capability principal. Deduplicate across principals only for authority-free
  validated results; abort work when its DOM/execution session is disposed, its
  authorization is revoked, or its revision changes.
- Keep direct structural decorations separate from viewport presentation marks
  so large documents do not rebuild every cosmetic decoration when one syntax
  tree fragment advances.
- Maintain a range index for semantic elements and plans; repeated per-line
  queries must not filter the complete element collection for every line.

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
- representative broad-safe inline tags, ruby annotations, quotations, `kbd`,
  safe anchors, and accessibility attributes;
- representative block structure, tables, details/summary, figures, contained
  layout styles, and workspace-relative media;
- Unicode/CJK content and quoted attributes;
- unclosed, mismatched, and malformed tags;
- void tags;
- `onclick`, `javascript:`, CSS `url()`, `expression()`, and blocked tags;
- capability-reduced attributes, contained versus escaping layout styles, and
  cases where reduction requires source or placeholder fallback;
- external `https` iframe intent, blocked `srcdoc`/`file://`, remote-load privacy
  policy, and local active-content denial;
- workspace asset traversal, symlink/alias/case escape, special files,
  validate-then-swap, MIME/sink mismatch, byte limits, and path disclosure;
- blocked/click-to-load external embeds, redirect/subresource denial,
  no-credential temporary partitions, popup/download/permission handling, and
  custom-protocol rejection;
- authorization revocation versus revision-triggered execution-session restart;
- caret positions at `from`, strictly inside, and `to`;
- range selection across the element;
- copy, paste, undo, Backspace, and IME composition;
- default broad-safe mode, external-web-embed policy, and explicit local
  active-content trust-grant modes;
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
    markdownHtmlProfiles.ts
    markdownCssPolicy.ts
    markdownUrlPolicy.ts
    markdownAssetPolicy.ts
    markdownEmbedPolicy.ts
    markdownTrustPolicy.ts
  plans/
    markdownPlanTypes.ts
    markdownPlanCompiler.ts
    markdownPlanIndex.ts
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
      embedHost.ts
      embeddedEditSession.ts
      widgetSession.ts
    preview/
      markdownPreviewRenderer.ts
    indexing/
      markdownLinkGraph.ts
  services/
    asyncRenderBroker.ts
    assetBroker.ts
    linkBroker.ts
    transactionBroker.ts
    webEmbedBroker.ts
  tests/
    fixtures/
    editor-view/
    security/
```

Existing modules should move only when a migration step materially clarifies
ownership. The architecture can first be enforced through APIs and tests while
files remain in their current directories.

---

## 12. Current implementation state

The 2026-07-10 migration now enforces these shipped invariants:

1. CodeMirror Markdown text is the only committed document truth. A compiled,
   range-indexed semantic/plan projection drives block widgets, inline HTML,
   marker deletion, atom expansion, task checkboxes, and horizontal rules.
2. Versioned `inline-editable`, `safe-block`, and explicitly composed
   `safe-media` profiles are non-escalating. Safe event/style reduction keeps
   honest structure; malformed, incomplete, blocked, or meaning-changing HTML
   remains visible source. The motivating styled `<span>`/`<strong>` cases
   render without a trust prompt. CSS variables cannot bypass display/network
   policy, geometry values are bounded and non-negative, and block HTML is
   contained with layout/paint clipping so presentation cannot cover app chrome.
3. Links are canonicalized once and activated only through `LinkBroker` plus a
   host-injected open capability. Raw HTML and preview DOM carry inert
   `data-md-href`, never ambient external `href` or `window.open` authority.
   Mermaid SVG anchors follow the same route rather than retaining live SVG
   navigation.
4. Every Markdown/HTML image load reaches `AssetBroker` before a sink. Remote
   images default to denied; `file:`, replayed blob/custom-protocol URLs,
   malformed escapes, traversal, SVG data, oversized data, wrong purpose, and
   cross-document principal reuse fail closed. Workspace paths have one parser,
   and broker handles are tied to view/document/revision/execution lifecycle.
   Local Markdown resolutions receive unique purpose-bound bearer leases;
   disposing a handle revokes the main-process token, and the public URL does
   not reveal the workspace root or source path.
5. Per-view widget, edit, execution, asset, async-render, transaction, link,
   and web-embed owners replace module-global or DOM-only state. Code, Mermaid,
   and table drafts mirror every input into a mapped recoverable session.
   Commits compare the exact original source slice, explicitly rebase only when
   that slice is unchanged, and commit source plus selection/effects in one
   transaction.
6. Mermaid work runs inside a real revision-bound `ExecutionSession`; revision
   change, remount, or disposal rejects stale async work. Mermaid source/output
   are byte-bounded, sanitized SVG uses local-only paint references, and its CSS
   is ShadowRoot-contained. Table assets are cleaned by one table-widget session
   rather than per-cell global observers; table drag/menu global listeners are
   deterministically removed even when a widget is disposed mid-gesture.
7. External HTTPS embeds are click-to-load and cross the renderer/preload/main
   boundary with an exact `web-embed` capability scope. Main binds them to the
   real trusted main-frame sender and owner window, uses a temporary
   no-credential Session, resolves every request target to public addresses,
   constrains top-level navigation to the initial origin, denies non-HTTPS
   subresources, permissions, popups, downloads and login, clips finite bounds,
   single-flights repeated activation, enforces pending+active quotas, and
   destroys on revision/owner/load/runtime failure. There is no focused-window
   fallback.
8. Inline-HTML range queries and compiled plans use interval indexes; nested
   Markdown marks compose instead of being dropped by an outer reserved range.

The remaining acceptance gaps are explicit rather than hidden behind passing
unit tests:

- The table-cell preview is an intentionally isolated string adapter that
  shares policy/token helpers; it is not yet the full document Lezer semantic
  plan. HTML-block plans also still carry raw source for the widget's final
  profile/trust decision.
- Inline HTML queries no longer add an O(lines × HTML-elements) scan, but the
  live-decoration StateField still rebuilds the whole document after ordinary
  non-composition edits. Incremental changed-range invalidation and profiling
  remain required for large files.
- Happy-DOM and main-process fixtures cover policy, conflicts, remount drafts,
  async cancellation, ownership and sandbox request rules. Real Chromium
  visual regression, viewport reuse, IME and sandbox tests are still required.

The target architecture is therefore adopted and its shipped paths are
closed; the bullets above are the bounded Phase 6 work, not permission to add a
second parser, sanitizer, URL validator, asset path resolver, or ambient DOM
authority.

---

## 13. Implementation record

### Phase 0 — approve the contract — complete

- Review this architecture with the Live Preview UX specification.
- Decide the initial shipped inline HTML tag/style allowlist.
- Decide whether global source mode remains hidden on Desktop.
- Agree on the safe behavior for partially supported inline HTML.

### Phase 1 — characterization tests — complete for pure layers

- Record current behavior for headings, lists, nested Markdown, HTML blocks,
  table cells, and inline HTML.
- Add parser-tree fixtures proving `HTMLBlock` versus paragraph `HTMLTag`.
- Add initial security fixtures before changing rendering.

DOM lifecycle, sandbox, viewport, IME, and embedded-edit integration fixtures
remain part of phases 5 and 6.

### Phase 2 — inline HTML semantic and policy foundation — complete

- Introduce the normalized inline HTML model and shared HTML tag tokenizer.
- Separate inline editor CSS policy from block-preview CSS policy.
- Add typed feature capability coverage for the initial inline path.
- Preserve current visible behavior except where required to expose an honest
  unsupported fallback.

### Phase 3 — inline HTML live preview — complete

- Safe inline marks and hidden/revealed tag markers.
- Typed atomic `<br>` plan with `lineBreaks` metadata and selection+Enter expansion.
- Nested Markdown marks with inline HTML.
- Motivating `<span style="color: ...">` list-item case.
- Incomplete / malformed inline HTML → `visibleSource` (no collapsed-marker deletion).
- EditorView composition smoke coverage via happy-dom fixtures.

### Phase 4 — converge render plans and policy — complete for shipped surfaces

- `MarkdownElementPlan` union + range-indexed compiler/index.
- Versioned `inline-editable` / `safe-block` / image-only `safe-media`
  profiles with explicit composition and capability reduction (no automatic
  profile escalation and no inventing union capabilities).
- Keymaps consume plan deletion/expand capabilities.
- Live decorations compile inline HTML through the plan boundary.
- Fence / table / HTML block widgets are created from compiled `blockAtom`
  plans (with table alignments/rows and fence/HTML payload in `blockData`).
- Table-cell Markdown/HTML preview renders through the isolated
  `renderMarkdownInlineFromSharedPolicy` adapter with broker-only image/link
  wrappers; it does not claim to be the full document plan adapter.
- Inline HTML and plan range lookup use interval indexes, and nested Markdown
  marks compose. **Follow-up:** heading/list/task/HR line chrome still uses
  dedicated line decorations; whole-document decoration invalidation must
  become changed-range incremental after profiling.

### Phase 5 — embedded component runtime — complete for shipped embeds

- Per-`EditorView` `MarkdownEmbedHost` with widget session registry,
  `EmbeddedEditSessionStore`, and revision-bound `ExecutionSessionStore`.
- Code / image / Mermaid / HTML / table widgets are immutable descriptors;
  mounted resources live in DOM-owned sessions with `disposeWidgetSessionDom`.
- Editor-scoped table focus uses one atomic source/selection/focus transaction;
  a feature-owned ViewPlugin restores focus only after CodeMirror commits the
  replacement DOM. Code/Mermaid/table commits compare the exact source slice,
  validate opaque document revision, permit only explicit source-unchanged
  rebase, and use mapped caret/effect positions. Drafts survive DOM
  detach/remount and are deleted only by commit or explicit cancel.
- Shared Asset / AsyncRender / Link / Transaction / WebEmbed brokers.
- Host-injected `markdownWorkspaceIdFacet` / `markdownWorkspaceRootFacet` feed
  `createPrincipalFromView` (DataWorkspace passes `workspace.id` / `workspace.path`).
- Trust policy requires explicit `local-active-html` grants; no script-capable
  srcdoc iframe in the editor renderer.
- Mermaid async renders own real revision-bound execution sessions. Table-cell
  resource cleanup is centralized in the table widget session; no per-cell
  document-wide observer exists.
- Local asset leases are opaque, exact-resource/purpose scoped, unique for
  Markdown handles, and hard-revoked through trusted IPC on handle/session/
  sender disposal. Filesystem roots and document paths are absent from URLs.
- Happy-DOM EditorView coverage now exercises table add-row/add-column, context
  menu move, pointer column drag, pointer row drag, and disposal. **Follow-up:**
  browser-backed DOM reuse/IME proof.

### Phase 6 — security, integration, and incremental hardening — in progress

- Desktop defaults to `htmlTrustMode="safe"`.
- External HTTPS embeds: click-to-load + revision-scoped `WebEmbedBroker` +
  sandboxed `WebContentsView`; exact trusted sender/owner binding; temporary
  no-credential Session; same-origin top navigation; per-request public DNS and
  HTTPS checks; finite clipped bounds; pending+active quotas; permission,
  popup, download and login denial; deterministic failure/owner cleanup.
- Adversarial URL/asset policy fixtures (control chars, entities, `file://`,
  traversal, data size/SVG).
- **Remaining acceptance gaps:** visual regression, full table-cell document
  plan convergence, changed-range decoration updates with large-document
  profiling, and fuller IME/DOM-reuse EditorView coverage in a real renderer.

The shipped foundation preserves source round-trip and has semantic, policy,
decoration, type, broker, trust, and boundary checks. Phase 6 acceptance
coverage above remains open; those tests validate the same source and plan
contracts rather than creating a second correctness model.

---

## 14. Acceptance criteria for the architecture migration

The migration is complete when:

- Markdown source remains the only canonical, committed, and persisted document
  model; mutable embedded drafts remain ephemeral editor interaction state.
- Parser context, not line-start heuristics, owns block/inline classification.
- Every supported construct has one normalized semantic representation.
- Every semantic element compiles to one typed render plan or an explicit
  visible-source fallback.
- Common non-executable inline and block HTML renders through the default
  broad-safe profiles without requiring document trust. The motivating styled
  `<span>` works in lists, paragraphs, headings, and table cells.
- Blocked event/script capabilities can be removed while preserving honest safe
  text and structure, with diagnostics and exact per-element source reveal;
  misleading reductions fall back to source or a typed placeholder.
- No source range receives overlapping replacement plans, and atomic, reveal,
  deletion, layout, and diagnostic behavior all derive from that plan.
- Main live preview, table cells, and read-only preview share dialect and
  policy decisions.
- Adding a semantic kind without a renderer or fallback fails CI.
- WidgetType values are immutable descriptors; every mounted DOM session,
  observer, listener, timer, and asynchronous task has deterministic per-view
  ownership and cleanup across `eq()` DOM reuse and viewport remount.
- Embedded edit sessions map through transactions, validate a base revision,
  isolate focus/drafts per editor, keep exactly one recoverable draft owner, and
  commit source plus mapped selection in one transaction.
- Assets, links, async rendering, and transaction commits use narrow host
  brokers rather than ambient renderer or Electron authority.
- Broker handles and authority-bearing caches are narrow-scope, bound to a
  capability principal, and immediately revoked or evicted when authorization
  or execution-session state changes. Local asset URLs are opaque,
  purpose/resource-bound bearer leases issued over trusted IPC and hard-revoked
  with their owner; they are not described as frame-bound capabilities. Blob
  URLs are likewise never treated as exact-principal capabilities.
- Unsafe inline HTML cannot enter the editor DOM.
- Workspace-relative safe assets use scoped broker handles rather than raw
  `file://`. Canonical/real-path containment, symlink/special-file rejection,
  open-handle revalidation, byte/MIME/sink limits, and path non-disclosure are
  covered by adversarial tests; external resources obey explicit
  privacy/network policy.
- External `https` iframe intents default to blocked or click-to-load and use
  `WebEmbedBroker` plus main-process-created sandboxed web contents in a
  temporary no-credential partition. Its session enforces top-level,
  redirect, subresource, permission, popup, download, and custom-protocol
  policy with no app or workspace authority.
- Local executable HTML defaults to disabled and requires explicit
  provenance-based authorization. Authorization grants are independent of
  revision-bound execution sessions, so edits restart a session without
  repeatedly prompting while a grant remains valid. Arbitrary local JavaScript
  never runs in an ordinary editor iframe; any future surface uses dedicated
  sandboxed web contents, a temporary partition, no Node/preload, an isolated
  renderer process, host-enforceable byte/time/resource limits, and a killable
  watchdog.
- Malformed, ambiguous, and unrenderable syntax remains visible and editable.
- Nested Markdown and inline HTML render without discarding either mark.
- Source is unchanged unless the user, Agent, or explicit command edits it.
- The Live Preview UX caret, reveal, selection, and no-layout-churn contract
  remains satisfied.
- Real EditorView and Electron tests cover background parsing, DOM reuse,
  viewport virtualization, layout measurement, IME, edit-session conflicts,
  async cancellation, and sandbox behavior.

---

## 15. Adopted target decisions

1. Paired inline tags may span soft line breaks inside one parser-recognized
   inline container.
2. A conventional element may render after unsafe or unsupported capabilities
   are removed when its remaining text and structure are honest. Diagnostics
   and reveal expose the exact source. If reduction changes its meaning, the
   element remains source-visible or becomes a typed placeholder.
3. PuppyOne targets broad sanitized HTML compatibility inspired by Obsidian,
   not exact compatibility with Obsidian's undocumented sanitizer behavior.
   Inline and block profiles support a versioned set of common tags,
   attributes, typography, decoration, contained layout, and media
   capabilities.
4. Desktop's global source-mode visibility is unchanged by this migration.
5. The existing DOM-reconstruction sanitizer may remain during migration. Live
   inline HTML never injects an HTML string: it compiles typed approved
   attributes directly into CodeMirror marks. One central policy authority must
   issue separate non-escalating surface profiles. A maintained structural
   sanitizer is the preferred target for HTML and SVG surfaces; a custom
   sanitizer requires equivalent adversarial tests.
6. Semantic authoring syntax for concepts such as "team-provided content" is
   not part of the raw inline HTML compatibility layer.
7. Bare `<br>` remains the first line-breaking void feature. Its target
   implementation must compile to one typed inline-atom plan with explicit
   line-break metadata and expansion behavior. Other conventional void/media
   elements may join a broad-safe profile only with an explicit render,
   interaction, resource, and fallback contract.
8. CodeMirror remains the outer Markdown editor. Complex blocks may use
   dedicated editing islands, but their committed form is always a Markdown
   source transaction.
9. WidgetType implementations must become immutable descriptors. Mounted
   resources and cleanup must belong to DOM sessions managed per EditorView.
10. Embed drafts and focus must become editor-scoped, range-mapped interaction
    state; module-global pending state and stale captured offsets are not
    accepted.
11. Built-in Markdown features must converge on a static typed registry and a
    shared plan compiler. A dynamic third-party plugin runtime is not required.
12. Local filesystem location does not imply active-content trust, but harmless
    sanitized formatting must not require a trust grant. Trust controls local
    executable content and elevated ambient capabilities, not basic HTML
    presentation or broker-scoped passive asset rendering.
13. Workspace-relative non-executable assets are allowed through scoped
    `AssetBroker` handles by the broad-safe profile. Raw `file://` access is not
    allowed; real-path containment, symlink and special-file rejection,
    open-handle revalidation, path non-disclosure, purpose binding, unique
    Markdown leases, and hard token revocation are mandatory. Capability URLs
    are narrow bearer leases; non-transferable authority uses authenticated IPC
    rather than pretending Electron protocol requests expose frame identity.
14. Explicit external `https` iframe syntax compiles to an isolated web-embed
    plan governed by workspace privacy/network policy. Loading defaults to
    blocked or click-to-load and uses main-process-created sandboxed web
    contents with a temporary no-credential partition. `srcdoc`, local scripts,
    and workspace HTML applications are not external web embeds.
15. Arbitrary local JavaScript, if ever supported, requires explicit revocable
    authorization and a disposable, dedicated sandboxed web-contents execution
    surface with a temporary partition, no Node/preload, a verified separate OS
    renderer process, host-enforceable limits, and a kill/recreate watchdog.
16. A persistent `AuthorizationGrant` is bound to provenance, capability, and
    policy version. A separate `ExecutionSession` is bound to an exact revision;
    revision changes restart the session under a still-valid grant instead of
    repeatedly asking the user for trust.

---

## 16. References

- [CommonMark specification](https://spec.commonmark.org/)
- [GitHub Flavored Markdown specification](https://github.github.com/gfm/)
- [CodeMirror decorations](https://codemirror.net/examples/decoration/)
- [CodeMirror reference manual](https://codemirror.net/docs/ref/)
- [Mermaid usage and security levels](https://mermaid.js.org/config/usage)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Obsidian HTML content](https://obsidian.md/help/html)
- [Obsidian embedded web pages](https://obsidian.md/help/embed-web-pages)
- [Obsidian plugin security](https://obsidian.md/help/plugin-security)
- [Obsidian Cure53 client audit](https://obsidian.md/files/security/2023-11-Obsidian-Cure53-Audit-Full.pdf)
- [Obsidian editor extensions and decorations](https://docs.obsidian.md/Plugins/Editor/Decorations)
- [Typora HTML support](https://support.typora.io/HTML/)
- [VS Code Markdown preview security](https://code.visualstudio.com/docs/languages/markdown#_markdown-preview-security)
- [VS Code Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)
- [VS Code Markdown extensions](https://code.visualstudio.com/api/extension-guides/markdown-extension)
- [ProseMirror guide](https://prosemirror.net/docs/guide/)
- [ProseMirror Markdown example](https://prosemirror.net/examples/markdown/)
- [Milkdown](https://github.com/Milkdown/milkdown)
- [OWASP Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
