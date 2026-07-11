# Renderer performance benchmarks

These benchmarks preserve the performance probes for the two interaction paths
that most directly affect file-opening responsiveness:

- Markdown source parsing, live-preview decoration construction, and React
  editor mount/disposal.
- Explorer selection updates with increasing rendered row counts.
- Markdown link-graph construction for the repository corpus and a bounded
  link-heavy synthetic corpus.
- 10,000-line single-character edits at the top, middle, and end; focus/reveal
  changes; and a table/HTML/Mermaid-heavy edit fixture.
- Revision-bound continuous A/B file switching and cancellation.

Run them serially so benchmark files do not compete for the same CPU:

```bash
npm run bench:performance
```

To save a machine-specific baseline or compare a later run:

```bash
npm run bench:performance -- --outputJson /tmp/puppyone-performance.json
npm run bench:performance -- --compare /tmp/puppyone-performance.json
```

## Interpretation

- Treat trends and before/after comparisons on the same machine as more
  meaningful than absolute numbers across machines.
- `renderer-interactions.bench.ts` uses happy-dom. It captures synchronous
  React/CodeMirror work and DOM creation, but not Chromium layout, paint, GPU,
  Electron IPC, or OS scheduling.
- The `development StrictMode` case intentionally measures React's development
  mount/effect replay. It is useful for developer experience and should not be
  confused with a production build result.
- These are opt-in benchmarks, not hard CI budgets. A real Electron renderer
  production Electron smoke is the gate for click-to-editor-ready latency and
  main-thread Long Tasks.

When changing the editor, tree, content cache, or link index, record the command,
hardware, branch/commit, median/mean, and p99 for the affected cases.

## Production Electron smoke

Build and run the real Chromium renderer harness:

```bash
npm run build
./node_modules/.bin/electron scripts/smoke-renderer-performance.mjs \
  --outputJson /tmp/puppyone-renderer-smoke.json
```

The harness performs 4 warm-ups and 30 measured A/B switches with 1,000
Explorer nodes and 10,000-line Markdown documents. It also applies one real
CodeMirror edit per sample and verifies the production Worker link-index
boundary. The command fails when the shell p95 exceeds 16ms, editor-base p95
exceeds 50ms, input p95 exceeds 16ms, a stale commit occurs, or a path-owned
Long Task exceeds 50ms.

Reference Apple M2 Pro / 16 GB / Electron 41.7.2 result on 2026-07-11:

| Measure | p50 | p95 |
|---|---:|---:|
| Preview shell committed | 1.3ms | 1.5ms |
| Content ready | 4.1ms | 5.7ms |
| Base EditorView ready | 3.1ms | 4.4ms |
| Markdown language ready | 10.8ms | 13.5ms |
| Live Preview ready | 26.7ms | 32.5ms |
| 10k input transaction | 0.7ms | 1.2ms |

The same window recorded 0 stale commits and 0 Long Tasks over 50ms. The
machine-readable before/after and smoke summary is in
`baselines/issue-024-m2-pro-2026-07-11.json`.
