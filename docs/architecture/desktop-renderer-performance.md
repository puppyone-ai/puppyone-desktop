# Desktop Renderer Performance Architecture

This document defines the performance contract for Explorer selection, file
opening, and Markdown editing in the Electron renderer. Markdown source remains
the only canonical document model; all indexes, plans, decorations, and worker
results are disposable projections of that source.

## Budgets

The reference run is a production build with 4 warm-up interactions followed
by 30 measured A/B file switches on a 1,000-node workspace and 10,000-line
Markdown documents.

| Interaction | Budget |
|---|---:|
| Explorer selection to preview shell commit, p95 | <= 16ms |
| File selection to base EditorView ready, p95 | <= 50ms |
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

`explorerRowStateStore.ts` is a path-addressed external store. Each mounted row
subscribes only to its primitive visual state, so ordinary selection notifies
the old and new paths without invalidating every row.

## Markdown projection contract

The base EditorView is committed from an effect with source, editing, history,
and layout extensions. Markdown language support is activated on the next
animation frame; Live Preview context and core projection are activated on the
following frame. Every scheduled frame is canceled on file switch or unmount.

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

Workspace Markdown backlinks are pure derived data. Path/title metadata stays
on the renderer for immediate link navigation, while content scanning runs in
`markdownLinkIndex.worker.ts`. `MarkdownLinkIndexCoordinator` terminates the
previous Worker on supersession and commits only the latest serializable index
snapshot. A non-Worker test fallback runs in a later task and follows the same
revision/cancellation contract. Link reference construction uses one line-start
index per document and cached target resolution, avoiding the former quadratic
prefix scans.

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

For a short diagnostic Chromium/V8 trace, add
`--trace /tmp/puppyone-renderer-trace.json`; trace mode uses three measured
samples and does not replace the 30-sample acceptance run.

Pure and happy-DOM comparison commands and the reference result are documented
in `benchmarks/performance/README.md`.

## Required regression coverage

Changes to this path must retain tests for Explorer DOM bounds and interactions,
changed-range Markdown projection, source snapshot/flush behavior, A/B request
cancellation, worker-index equivalence/cancellation, Markdown round-trip and
IME, table interactions, widget/session cleanup, and trust/policy/asset/web
embed security. The final gate is `npm test`, `npm run lint`,
`npm run check:shared-ui`, and `npm run build`.
