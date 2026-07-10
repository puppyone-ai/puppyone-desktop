# Renderer performance benchmarks

These benchmarks preserve the performance probes for the two interaction paths
that most directly affect file-opening responsiveness:

- Markdown source parsing, live-preview decoration construction, and React
  editor mount/disposal.
- Explorer selection updates with increasing rendered row counts.
- Markdown link-graph construction for the repository corpus and a bounded
  link-heavy synthetic corpus.

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
  trace should eventually gate click-to-editor-ready latency and main-thread
  long tasks in addition to these lower-level probes.

When changing the editor, tree, content cache, or link index, record the command,
hardware, branch/commit, median/mean, and p99 for the affected cases.
