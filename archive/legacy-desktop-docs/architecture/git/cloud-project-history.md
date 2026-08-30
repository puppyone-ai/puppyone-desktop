# Cloud Project History

Architecture home: [Git and Source Control Architecture](README.md).

Status: **Implemented** (`ISSUE-030`, 2026-07-12).

This document owns the Cloud project History surfaces: the commit tree the
user sees after opening **History** on a Cloud project, and the read-only
commit detail view. It is the product and architecture contract tracked by
workboard issue `ISSUE-030`; graph drawing primitives are shared with
[Cloud Branch Graph Layout](cloud-branch-graph-layout.md).

## Status Legend Usage

- **Implemented** — behavior present in the current codebase.
- **Proposed** — accepted target contract, still requires code changes.
- **Known gap** — current behavior that violates this contract.

## Product Decision (locked)

The two History surfaces have different topology requirements. This is a
deliberate product decision, not an implementation accident:

1. **Local workspace history (Source Control sidebar)** — a linear,
   current-branch commit list is acceptable. The local sidebar answers
   "what happened on the branch I am working on"; VS Code's SCM view makes
   the same trade-off. The all-branches graph remains available through the
   Branches surface.
2. **Cloud project History** — opening History on a Cloud project MUST show
   the full commit tree across **all branches** of that project, equivalent
   to `git log --graph --all` and visually aligned with VS Code's Source
   Control Graph. A Cloud project is a shared, multi-writer repository;
   showing only one linear chain hides merges, concurrent agent branches,
   and pushed feature branches, and misrepresents the true state of the
   project.

A Cloud project History that renders one straight lane is a **defect**, not
a simplification. `cloud-branch-graph-layout.md` display example 13 already
forbids this outcome for the Branches surface ("must not degrade into one
long blue lane"); this document extends the same rule to Cloud History.

## Current Architecture

### Data flow (Implemented)

```text
CloudHistorySection / DesktopWorkspaceContent
        |
        v
useCloudHistoryController
        |-- useCloudHistoryData
        |-- graph/model.ts
        |-- selected commit state (shared by both surfaces)
        v
cloudHistoryApi.ts  ->  GET /content/{projectId}/commits
        |                         ?order=topo&limit=80&cursor=...
        v
Backend HistoryGraphService
        |-- atomic DB snapshot: canonical main + version_refs
        |-- facts: immutable Git commit parent_ids
        |-- order: deterministic child-before-parent topo order
        |-- page: HMAC snapshot cursor + has_more
        |-- cache: app-scoped TTL/LRU + single-flight + node budget
        v
buildCloudBranchGraphRows({ history })          (src/features/cloud/graph/model.ts)
        |
        +-- parent_ids + refs -> stable lanes, path colors, ref-only rows
        +-- local Git snapshot -> equivalent git graph-prefix layout
        |
        v
CloudHistorySection
        |-- CloudProjectHistorySidebar (selectable graph + Load more)
        `-- CloudProjectHistoryView (synchronized read-only detail)
```

### Delivered invariants (Implemented)

1. The graph response carries `parent_ids`, branch/tag `refs`, `snapshot_id`,
   `next_cursor`, `has_more`, and graph health. Commits reachable only from a named ref are
   decoded from the canonical Git object store and remain visible even when
   no transaction-history row exists for them.
2. `order=topo` is an explicit graph-read mode. The legacy linear
   `since_commit_id` catch-up contract remains unchanged for WebSocket and
   existing web clients.
3. Lane assignment lives in `src/features/cloud/graph/model.ts`; JSX only draws
   segments. Active ancestry survives page boundaries, so appending an older
   page cannot reorder or recolor already-rendered commit rows.
4. Cloud → History is a two-pane surface with HEAD selected by default,
   selectable commit rows, synchronized details, inline ref pills, ref-only
   overflow rows, and a read-only Load more action. The panes form one continuous
   workspace: they do not add duplicate History headers, persistent repository
   footers, or snapshot-hash sections.
5. History commit rows are uniformly 32px, matching the local Source Control
   History density. Git continuation prefixes are folded into the owning
   row's SVG, rails remain continuous through hover and selection, and lane
   reuse receives a new path color.
6. The first page resolves main and named refs in one PostgreSQL MVCC snapshot.
   Continuation cursors are signed, project-bound, and carry the immutable
   ordered root set, so ref movement cannot reorder, duplicate, or omit pages.
   Continuation responses omit repeated refs (`refs_included=false`); clients
   retain the first page's labels for that `snapshot_id`.
7. Legacy linear catch-up never depends on `version_refs`. A named-ref control
   plane outage fails the all-branch graph closed without taking down existing
   linear consumers.
8. Missing/corrupt Git objects preserve healthy history and surface
   `graph_health=degraded`; they are not indistinguishable from ordinary
   pagination overflow.

### Module ownership (Implemented)

- Backend `read/history_graph.py` owns graph orchestration and traversal;
  `history_cursor.py`, `history_cache.py`, and `history_models.py` own their
  narrow policies. `read/admin.py` remains the legacy history/content/diff
  facade, and the HTTP router contains no ref-merging logic.
- Desktop `features/cloud/history/` owns data lifecycle, controller, pagination
  invariants, sidebar, detail, SVG, and styles. `pagination.ts` is pure policy;
  the React hook only owns request lifecycle. `features/cloud/graph/model.ts` is its small public
  adapter; `cloudTopology.ts`, `gitTopology.ts`, and `shared.ts` isolate the
  Cloud DAG, local Git-prefix, and ref-presentation policies shared by History
  and Branches. `lib/cloudHistoryApi.ts` validates and normalizes untrusted API
  responses before feature code sees them, retaining an explicit
  `topology_available` compatibility bit instead of conflating missing ancestry
  with a root commit.

### Backend facts this contract builds on (Implemented)

The backend already stores everything a full tree needs; only the read
path hides it:

- Commit objects are real Git commit objects whose `parents` are parsed
  and validated
  (`puppyone/backend/src/version_engine/write_engine/git_commit.py`).
- Branch and tag refs pushed to a scope remote are persisted per
  `(project_id, scope_path, ref_name)` in the `version_refs` table
  (`version_ref_repository.py`, multi-branch GAP-3 Phase 1,
  `puppyone/docs/proposals/PUP-multi-branch-design.md`).
- The scope head (`refs/heads/main`) is tracked separately in scope state
  and exposed today as `head_commit_id`.

## Target Contract (Implemented)

### 1. History read API exposes topology

The Cloud history response MUST carry, per commit, `parent_ids`
(0..n 40-hex ids), and, per project, the named refs relevant to the
requested scope: the main head plus `version_refs` branch/tag rows
(`ref_name`, `commit_id`, `ref_type`). Pagination MUST be cursor-based
(reuse `since_commit_id` or an explicit cursor) so clients can walk
arbitrarily deep history in stable pages. Ordering MUST be
topology-compatible (children before parents within a page, matching
`git log --topo-order` semantics) so the client renderer never has to
re-sort.

### 2. Layering mirrors the Branches architecture

The same three-layer rule from `cloud-branch-graph-layout.md` applies:

1. **Topology source** — the server owns commit ancestry and refs. The
   renderer must not infer topology from commit messages, timestamps, or
   React state.
2. **View model** — `src/features/cloud/graph/model.ts` converts ancestry + refs
   into lanes, segments, ref markers, and labels. Lane assignment for
   Cloud history derives from `parent_ids` server data (or a
   server-provided graph prefix); it never guesses.
3. **Rendering** — components draw what the view model says. No lane or
   merge decisions in JSX.

### 3. VS Code Source Control Graph is the UX baseline

- **Uniform row heights.** Every commit row has the same height. Merge and
  fork curves are drawn between adjacent row centers inside the rows
  themselves. Dedicated sub-row "continuation strips" are not part of the
  target rendering.
- **Continuous rails.** A lane that passes through a row renders as an
  unbroken vertical rail; hover/selection backgrounds must not visually
  sever the graph column.
- **Per-branch colors.** Colors follow branch paths. When a lane is
  vacated and reused by a different branch, the new occupant gets a new
  color. The HEAD node uses its own lane color with a distinct marker; it
  is not forced to the brand color.
- **Inline ref labels.** Branch and tag names render as pills on the
  commit row itself (message column), exactly where VS Code shows them.
  Grouped ref markers in the graph column remain as secondary indicators
  for dense rows.
- **HEAD emphasis.** The project head commit is visually distinct (marker
  plus label), and is the default selection.
- **Incremental loading.** Reaching the end of the loaded window offers
  "load more" (or loads on scroll). The graph extends seamlessly across
  pages.
- **Shared detail hierarchy.** Cloud commit details reuse the local History
  hierarchy: compact SHA/message/author metadata, file and line totals, then
  one canonical format-aware card per changed file. Cloud-only history may
  show metadata-only card bodies when revision content is unavailable. Refresh
  and Cloud navigation live as quiet icon actions on the commit identity row;
  internal snapshot IDs are not part of the default presentation.

### 4. History route is a two-pane surface

Every entry point that opens Cloud project History MUST present both the
commit tree (selectable list with the graph column) and the commit detail
pane. A detail pane without a selectable tree is not a History surface.
The read-only nature of Cloud history is unchanged: selection inspects; it
never mutates.

### 5. Equivalent local source rule

A Cloud workspace with a mapped local repository MAY reuse the local
`git log --graph` snapshot (the Branches section's
`useCloudBranchesGitStatus` path) as an equivalent topology source. The
Cloud API is authoritative for Cloud-only projects and exposes the same
ancestry/ref facts; History call sites do not use a hard-coded null topology
argument.

## Non-Goals

- No write operations from Cloud History (checkout, revert, cherry-pick,
  branch create/delete). The surface stays read-only.
- No server-side merge/PR UI. Landing a branch remains a separate contract
  (multi-branch Phase 2+).
- Local Source Control sidebar history keeps its linear current-branch
  presentation.

## Evolution seams

- If server build telemetry shows the bounded on-demand traversal no longer
  meets the History latency objective, a materialized commit-graph index can be
  introduced behind `HistoryGraphService`; the HTTP schema, signed snapshot
  cursor, and Desktop data layer do not change.
- If users routinely retain thousands of loaded rows, windowing belongs inside
  `CloudProjectHistorySidebar`. Stable row IDs and the pure graph model let that
  renderer change without moving selection, paging, or topology into JSX.
- Author/message search is a separate server read-model query. It must return
  ancestry/ref context for its result window rather than filtering the loaded
  client page and pretending the resulting gaps are a complete graph.

## Invariants

- Cloud History topology comes from server-provided ancestry and refs (or,
  interim, from `git log --graph` of a mapped local repository) — never
  from a renderer-local lane state machine and never from commit-message
  heuristics.
- All branches reachable from stored refs are visible in the Cloud History
  tree; a branch head outside the loaded window degrades to a ref-only row
  (see `cloud-branch-graph-layout.md` example 12), not to silence.
- Commit rows are the only interactive rows.
- The commit list and the detail pane always agree on the selected commit.
- Pagination never re-orders previously rendered rows.
- Every continuation page has the same `snapshot_id`; a client MUST discard and
  refresh a mismatched page rather than merge snapshots.
- Graph cache memory is bounded by retained node-container weight and TTL, not
  only by a count of repository keys. Concurrent misses for one snapshot share
  one build.
