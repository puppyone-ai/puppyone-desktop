# Desktop Renderer Performance Architecture

This document defines the performance contract for Explorer selection, file
opening, and Markdown editing in the Electron renderer. Markdown source remains
the only canonical document model; all indexes, plans, decorations, and worker
results are disposable projections of that source.

## Budgets

The warm reference run is a production build with 4 warm-up interactions
followed by 30 measured A/B file switches on a 1,000-node workspace and
10,000-line Markdown documents. A separate fresh Electron process verifies the
first cold Markdown open while workspace content indexing is enabled.

| Interaction | Budget |
|---|---:|
| Explorer selection to preview shell commit, p95 | <= 16ms |
| File selection to base EditorView ready, p95 | <= 50ms |
| Cold first selection to painted Live Preview | <= 150ms |
| 10,000-line input transaction, p95 | <= 16ms |
| Path-owned renderer Long Tasks | 0 over 50ms |
| Stale file/index commits | 0 |

These are production Electron budgets. Happy-DOM benchmarks are same-machine
trend evidence and are not cross-machine absolute gates.

Before any editor file-size cap is raised, the production harness must also run
1 MiB, 5 MiB, and 20 MiB profiles plus oversized single-block fixtures. The
acceptance conditions are structural as well as temporal:

| Oversized case | Required bound |
|---|---:|
| Windowed table mounted rows | visible rows + configured overscan + interaction-pinned rows |
| Windowed block DOM | O(visible logical items), not O(total logical items) |
| Oversized block path-owned Long Tasks | 0 over 50ms |
| Scroll-anchor corrections per settled measurement batch | <= 1 |
| Stale async block commits after edit/unmount | 0 |

Byte, line, logical-item, DOM-node, nesting, asset, and compute thresholds are
reported with each benchmark result. Raising a threshold without updating the
reference trace and memory/DOM evidence is an architecture change, not a local
widget tweak.

## Two scheduling lanes

```text
urgent renderer lane                         deferred derived-data lane

Explorer click                               Markdown language activation
  -> row-local selection update                -> visible projection
  -> preview shell commit                      -> heavy widget broker work
  -> cancellable content read                  -> workspace link-index worker
  -> base EditorView                            -> persistence snapshot boundary
```

Urgent work is bounded by visible rows or the current changed range. Deferred
work owns a document/revision generation and must validate it before commit.
Superseding work is aborted or terminated, not merely ignored after consuming
the same renderer task.

## Explorer contract

`explorerVisibleModel.ts` flattens the expanded tree only when tree or expansion
state changes. It provides stable row order plus path-to-index and path-to-node
maps. `useExplorerVirtualWindow.ts` mounts a fixed-size window with overscan and
a hard limit of 100 DOM rows. Keyboard navigation, Shift range selection,
scroll-to-active, and drag/drop operate on the complete flattened model, not
the mounted subset.

Expansion motion follows the same bound. `explorerMotionPlan.ts` creates a pure
FLIP plan from the previous and next visible models, but emits instructions
only for mounted rows. New children fade/translate into place, surviving rows
animate their inverse index delta, and removed rows may remain as inert exit
ghosts only while capacity remains below 100. Motion uses compositor-only
transform/opacity Web Animations, never subtree height measurement, and is
disabled for reduced-motion users. Initial/restored expansion does not animate;
scrolling cancels an active plan rather than animating recycled rows.

`explorerRowInteraction.ts` is a pure mounted-row selector. `TreeNodeRow` is
memoized with an explicit comparison of its primitive interaction state, so an
ordinary selection re-renders only the old and new rows. No store is mutated
during React render, which keeps this optimization compatible with concurrent
rendering.

## Markdown projection contract

The base EditorView is committed from an effect with source, editing, history,
and layout extensions. The selected document route owns lazy-viewer preloading,
so module acquisition overlaps content I/O even while the previously committed
document remains visible. The loader cache deduplicates that request with the
host fallback and React.lazy.

Markdown language support and Live Preview activation then run as two separate
cancellable `scheduler.postTask({priority: "user-blocking"})` tasks (zero-delay
tasks on hosts without the Scheduler API). This preserves a yield between
parsing and projection without forcing two extra frame delays. During those
tasks the base EditorView remains in layout for measurement but its canonical
source is `visibility: hidden` and non-interactive. A final animation frame
confirms the same document revision and atomically commits the rendered
presentation. Revision changes re-arm confirmation; file/mode supersession
cancels the generation. Source Mode bypasses the gate, and an activation error
falls back to visible source with an explicit notice. Every task and frame is
canceled on file switch or unmount.

`MarkdownDocumentProjection` is EditorView-scoped:

- existing decoration sets map through `ChangeSet`;
- `iterChangedRanges` expands edits only to stable neighboring blocks;
- focus/reveal patches only the previous and next reveal ranges;
- viewport changes do not dispatch projection transactions;
- trust, document path, or asset resolver changes are explicit global
  invalidations;
- structural replacements remain CodeMirror decorations and therefore retain
  line-height, selection, and viewport correctness.

The complete layout-sensitive decoration set is provided directly before
CodeMirror computes its viewport. This is full-document range metadata, not
full-document DOM: CodeMirror still mounts only visible lines and widgets.
Viewport-only presentation remains a reserved branch for decorations proven
not to affect glyph metrics, wrapping, height, or measurement. Scrolling is a
consumer of CodeMirror's height map and must not become an invalidation source.

Document viewport virtualization does not bound one unusually large block. The
canonical [Markdown architecture oversized-block contract](editor/markdown/architecture.md#46-complexity-budgets-and-oversized-block-execution)
therefore uses centralized, versioned complexity decisions and nested item
virtualization or typed fallback. Large tables keep total estimated geometry
but mount only visible rows plus overscan and interaction-pinned rows; their
semantic model is capped at 5,000 rows, 50,000 cells, and 64 columns. The
64 KiB per-row / 4 MiB total-source bounds prevent a single pathological cell
from bypassing that row window. HTML and Mermaid use explicit deferred
activation, oversized code remains visible source, and compound HTML media
resolves per asset. None of these paths relies on CSS containment as its only
bound.

Inline token scanners are line-bounded and advance past an already inspected
malformed range. They may not rescan the same long suffix for every unmatched
`[`, `[[`, or `![`. Decorations tokenize each physical line once per token
kind, not once per semantic element. Isolated string previews (for example a
table cell) have explicit source-length, candidate-count, and recursion-depth
budgets; an over-budget fragment remains exact, selectable plain text rather
than blocking the renderer.

Cold Live Preview activation uses three revision-checked, cancellable renderer
tasks: language activation, semantic plan precomputation, then installation of
the geometry-sensitive projection. The second and third phases share the
syntax-tree/revision-scoped plan index. They may not be recombined into one
synchronous task, because a feature-dense 10k-line document can otherwise
cross the renderer Long Task boundary even though each phase is independently
bounded. The editor stays behind the atomic preview-readiness gate until the
matching projection paints.

## React/source boundary

Ordinary CodeMirror input reports only `{revision, dirty}`. It does not call
`doc.toString()` or propagate a full source string through React. An
`EditorSourceSnapshotPort` reads the canonical source at explicit save,
debounced autosave, mode switch, file switch, and destroy boundaries. External
source updates carry an annotation so they cannot form a writeback loop.

Destroy is a mandatory flush boundary. The snapshot is taken before
`EditorView.destroy()`, and persistence receives the exact revision snapshot.

## File and index cancellation

`FileOpenRequestCoordinator` owns one `AbortController` and generation. Content
may commit only when both document path and generation are current. Selection
and the empty preview shell do not wait for content acquisition.

Only user-opened payloads enter `fileContentCache`, which is an MRU capped at
12 entries and 8 Mi characters of source. A single over-budget file remains in
active-file state but is not retained after navigation. Workspace indexing is
strictly prohibited from populating this cache.

Workspace Markdown backlinks are pure derived data. Path/title metadata stays
on the renderer for immediate link navigation, while content scanning runs in
`platform/indexing/markdownLinkIndex.worker.ts`. The coordinator reads and
posts one document at a time during idle turns; it never assembles a workspace
array of full sources and never puts background-index source into React's file
content cache. Worker acknowledgement provides backpressure. The Worker stays
alive after the initial build so a save replaces only that document's derived
contribution.

Supersession aborts the reader, terminates the Worker, rejects pending
operations, and prevents stale snapshots from committing. The non-Worker test
fallback follows the same revision contract. The index retains compact derived
data only: at most 20,000 links per document, 8,000 source/target backlink
records, 8 references per source/target, 8,000
references globally, and 320 characters per excerpt. Reference
construction uses one line-start index and cached target resolution per
document.

## Measurement and reproduction

`RendererPerformanceTracker` records `performance.mark`/`measure` entries for:

- `file_select`;
- `preview_shell_committed`;
- `content_ready`;
- `editor_base_ready`;
- `markdown_language_ready`;
- `preview_ready`;
- CodeMirror input transactions, owned operations, stale commits, and Long
  Tasks.

Run the production smoke and write its JSON report:

```bash
npm run build
node scripts/run-renderer-performance-smoke.mjs \
  --outputJson /tmp/puppyone-renderer-smoke.json
```

The warm smoke then opens a 1,001-logical-row Markdown table in the same real
Chromium renderer, records the initial and post-scroll mounted row counts, and
fails if either exceeds 80 or the logical window does not advance. Long-task
observation remains active across this structural check.

The Node launcher is part of the gate: macOS Electron lifecycle helpers can
return zero through the CLI launcher even after an in-app validation failure.
The Electron process therefore publishes a completion record to its parent,
and the parent owns the observable CI exit code.

Run the cold-first-open/index-contention gate in a visible production window:

```bash
npm run smoke:renderer-cold-performance
```

The cold harness performs no warm-up, enables the 250-document streaming index,
keeps observing for 1.5 seconds after preview paint, and fails on a cold preview
over 150ms or any renderer Long Task over 50ms.

For a short diagnostic Chromium/V8 trace, add
`--trace /tmp/puppyone-renderer-trace.json`; trace mode uses three measured
samples and does not replace the 30-sample acceptance run.

Pure and happy-DOM comparison commands and the reference result are documented
in `benchmarks/performance/README.md`.

## Required regression coverage

Changes to this path must retain tests for Explorer DOM/motion bounds and
interactions, changed-range Markdown projection, source snapshot/flush
behavior, A/B request cancellation, streaming worker equivalence,
cancellation and incremental updates, pathological inline-token complexity,
Markdown round-trip and IME, table interactions, oversized-block budget and
mounted-DOM bounds, active-row recycling/IME, widget/session cleanup, and
trust/policy/asset/web-embed security. Production smoke must also prove that
the base EditorView is visually hidden before `preview_ready` and visible only
after the matching revision commits. The final gate is `npm test`,
`npm run lint`, `npm run check:shared-ui`, both production renderer smokes, and
`npm run build`.
