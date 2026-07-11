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
useCloudBranchesData  ->  getCloudHistory(session, projectId, cursor)
        |                     GET /content/{projectId}/commits
        |                         ?order=topo&limit=80&cursor=...
        v
Backend history graph read model
        |-- roots: refs/heads/main + version_refs branches/tags
        |-- facts: immutable Git commit parent_ids
        |-- order: deterministic child-before-parent topo order
        |-- page: next_cursor + has_more (legacy since_commit_id unchanged)
        v
buildCloudBranchGraphRows({ history })          (src/features/cloud/model.ts)
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

1. The graph response carries `parent_ids`, branch/tag `refs`,
   `next_cursor`, and `has_more`. Commits reachable only from a named ref are
   decoded from the canonical Git object store and remain visible even when
   no transaction-history row exists for them.
2. `order=topo` is an explicit graph-read mode. The legacy linear
   `since_commit_id` catch-up contract remains unchanged for WebSocket and
   existing web clients.
3. Lane assignment lives in `src/features/cloud/model.ts`; JSX only draws
   segments. Active ancestry survives page boundaries, so appending an older
   page cannot reorder or recolor already-rendered commit rows.
4. Cloud → History is a two-pane surface with HEAD selected by default,
   selectable commit rows, synchronized details, inline ref pills, ref-only
   overflow rows, and a read-only Load more action.
5. History commit rows are uniformly 42px. Git continuation prefixes are
   folded into the owning row's SVG, rails remain continuous through hover
   and selection, and lane reuse receives a new path color.

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
2. **View model** — `src/features/cloud/model.ts` converts ancestry + refs
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
