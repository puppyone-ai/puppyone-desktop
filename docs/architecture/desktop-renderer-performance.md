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
and layout extensions. While content is still being acquired, a lazy viewer
module is prefetched through the preset-viewer loader cache so download and I/O
overlap. Markdown language support and Live Preview activation then run as two
separate cancellable `scheduler.postTask({priority: "user-blocking"})` tasks
(zero-delay tasks on hosts without the Scheduler API). This preserves a yield
between parsing and projection without forcing two extra frame delays. A final
animation frame confirms the activated revision actually painted. Every task
and frame is canceled on file switch or unmount.

`MarkdownDocumentProjection` is EditorView-scoped:

- existing decoration sets map through `ChangeSet`;
- `iterChangedRanges` expands edits only to stable neighboring blocks;
- focus/reveal patches only the previous and next reveal ranges;
- viewport changes replace the visible partition plus bounded overscan;
- trust, document path, or asset resolver changes are explicit global
  invalidations; link-graph identity changes invalidate only the viewport;
- structural replacements remain CodeMirror decorations and therefore retain
  line-height, selection, and viewport correctness.

Non-visible presentation decorations are not eagerly materialized. CodeMirror
keeps its complete incremental Markdown syntax model; scrolling requests the
new visible presentation partition. This preserves full Markdown behavior
without a second rich-text document model.

Inline token scanners are line-bounded and advance past an already inspected
malformed range. They may not rescan the same long suffix for every unmatched
`[`, `[[`, or `![`. Decorations tokenize each physical line once per token
kind, not once per semantic element. Isolated string previews (for example a
table cell) have explicit source-length, candidate-count, and recursion-depth
budgets; an over-budget fragment remains exact, selectable plain text rather
than blocking the renderer.

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
./node_modules/.bin/electron scripts/smoke-renderer-performance.mjs \
  --outputJson /tmp/puppyone-renderer-smoke.json
```

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
Markdown round-trip and IME, table interactions, widget/session cleanup, and
trust/policy/asset/web-embed security. The final gate is `npm test`,
`npm run lint`, `npm run check:shared-ui`, both production renderer smokes, and
`npm run build`.
