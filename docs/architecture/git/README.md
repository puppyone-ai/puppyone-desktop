# Git and Source Control Architecture

This directory is the architecture home for Git-backed version control in
PuppyOne Desktop. It covers the local Source Control experience, repository
status freshness, and Git history topology shared with Cloud-facing surfaces.

## Status Legend

- **Implemented** describes behavior present in the current codebase.
- **Proposed** describes an accepted target contract that still requires code
  and test changes.
- **Known gap** describes current behavior that violates a documented target
  contract.

Documents must use these labels explicitly. A proposed design must not be
described as current behavior before its implementation and verification land.

## Documents

- [Local Source Control Sidebar](local-source-control-sidebar.md)
  - **Implemented**.
  - Owns renderer state, sidebar view-model rules, UI actions, IPC boundaries,
    and the end-to-end local Git data flow.
- [Repository Status Refresh Lifecycle](status-refresh-lifecycle.md)
  - **Implemented**.
  - Owns the repository watcher, refresh scheduler, focus reconciliation, error
    recovery, fast status / lazy history split, and lifecycle verification.
- [Cloud Branch Graph Layout](cloud-branch-graph-layout.md)
  - **Implemented**.
  - Owns Git topology, ref markers, graph continuation rows, and Cloud Branches
    rendering rules.
- [Cloud Project History](cloud-project-history.md)
  - **Implemented**.
  - Owns the Cloud project History surfaces: all-branches commit tree,
    topology/cursor data contract, VS Code Source Control Graph UX baseline,
    and the local-vs-cloud linearity decision.
- [Format-Aware Diff Pipeline](format-aware-diff-pipeline.md)
  - **Implemented** for text, DOCX, and metadata fallback.
  - Owns revision-pair authority, the built-in Diff Registry, resource-handle
    security, semantic provider lifecycle, and rich-diff extension rules.

## Code Map

- `src/features/source-control/`
  - local Source Control sidebar, detail view, view models, and renderer state
- `src/features/source-control/gitRefreshScheduler.ts`
  - cancellable single-flight, dirty trailing, repository-epoch and
    generation-ordered refresh scheduler
- `src/features/source-control/repositoryRefreshPolicy.ts`
  - structured invalidation causes and history-preservation policy
- `src/features/source-control/useGitRepositoryLifecycle.ts`
  - watcher readiness, cancellable status state, repository contexts, focus and
    history publication boundary
- `src/features/app-shell/DesktopWorkspaceContent.tsx`
  - mounts the Git sidebar and main Git view into the shared desktop shell
- `src/lib/localFiles.ts`
  - typed renderer bridge for Git status, operations, and metadata watch
- `electron/preload.cjs`
  - context-isolated Git, workspace-watch, and metadata-watch bridge
- `electron/main/ipc/workspace-git-ipc.mjs`
  - authorized Git IPC handlers
- `electron/main/ipc/git-metadata-watch-ipc.mjs`
  - authorized metadata watch start/stop IPC
- `electron/main/workspace-watch-service.mjs`
  - workspace content watcher (continues to exclude `.git/**`)
- `electron/main/git-metadata-watch-service.mjs`
  - Git metadata watcher, pending-init promotion, common-dir fan-out
- `electron/main/git-operation-coordinator.mjs`
  - per-repository serialization for application-owned Git mutations and
    idle-gated reads
- `electron/main/git-diff-resource-broker.mjs`
  - audience/session/revision-bound immutable bytes for rich diff providers
- `local-api/workspace.mjs`
  - workspace-facing Git status, history, parsing, and mutations
- `local-api/git/revision-specs.mjs` and `local-api/git/revision-pair.mjs`
  - trusted scope/status derivation and bounded before/after revision reads
- `local-api/git/runner.mjs`
  - bounded/cancellable Git CLI execution and streaming output policy
- `local-api/git/porcelain-v2.mjs`
  - isolated porcelain-v2 parser for bounded status output
- `tests/gitRefreshScheduler.test.ts`
  - scheduler ordering, cancellation, repository epochs, focus, and error unit coverage
- `tests/gitOperationCoordinator.test.mjs`
  - per-repository mutation serialization and cancellable idle waits
- `tests/electron.git-status-ipc.test.mjs`
  - renderer-scoped status cancellation, including cancel-before-start races
- `tests/gitPorcelainV2.test.mjs`
  - isolated porcelain-v2 parsing coverage
- `tests/electron.git-metadata-watch.integration.test.mjs`
  - real-repository metadata watcher and external Git freshness coverage
- `tests/workspace.git.integration.test.mjs`
  - real-repository integration coverage for the local Git engine

## Cross-Domain Boundaries

The following documents stay outside this directory because they own contracts
shared by more than Git:

- [Desktop Sidebar View Stack](../desktop-sidebar-view-stack.md)
  owns mounting, keep-alive behavior, visibility, pointer interaction, and focus
  boundaries across Data, Git, Cloud, and Settings.
- [Desktop Sidebar Scroll Lists](../desktop-sidebar-scroll-lists.md)
  owns shared scrollbar, gutter, list-padding, and row-geometry rules.
- [Desktop Multi-Window Workspaces](../desktop-multi-window-workspaces.md)
  owns one-repository-per-window state, canonical workspace identity, and
  window-scoped resource cleanup.
- [Desktop Terminal Architecture](../desktop-terminal-architecture.md)
  owns xterm/node-pty lifecycle. A future integrated-terminal Git completion
  signal should link back to the refresh lifecycle here.
- [Cloud Workspace State Boundaries](../cloud-workspace-state.md)
  owns Cloud authentication, project binding, service routing, and Git remote
  interpretation for Cloud features.
- [Release](../../RELEASE.md)
  owns application versions, tags, GitHub Releases, signing, and publishing. It
  is not part of workspace source control.

## Architecture Invariants

- Git commands execute outside the renderer and only against a main-process
  authorized workspace.
- The renderer consumes typed snapshots and does not infer repository state from
  filesystem events.
- Filesystem events are invalidation signals; a fresh Git query remains the
  source of truth.
- Working-tree content changes and Git metadata changes have different
  consumers and must not share an undifferentiated refresh path.
- Application-initiated mutations reconcile status before the operation is
  considered settled.
- External Git changes eventually reconcile without requiring a workspace
  reload.
- History and graph loading must not make frequent working-tree refreshes
  unnecessarily expensive.
