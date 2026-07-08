# Desktop Feature Architecture

This file is the index for durable product and frontend architecture decisions
for PuppyOne Desktop. Feature-specific guidance lives in focused documents so a
single product area can evolve without turning this file into a catch-all.

## Architecture Documents

- [Cloud Workspace State Boundaries](architecture/cloud-workspace-state.md)
  - Cloud environment, auth, workspace binding, project data, and route-state
    boundaries.
- [Cloud Branch Graph Layout](architecture/cloud-branch-graph-layout.md)
  - Git topology source of truth, branch/ref display rules, and graph examples.
- [Smooth Preview Transitions](architecture/smooth-preview-transitions.md)
  - File selection, loaded content, committed preview documents, and editor
    mount lifecycle.
- [Desktop Sidebar View Stack](architecture/desktop-sidebar-view-stack.md)
  - Keep-alive behavior for the Data, Git, Cloud, and Settings sidebar surfaces.
- [Desktop Sidebar Scroll Lists](architecture/desktop-sidebar-scroll-lists.md)
  - Scroll area, list padding, row width, and native scrollbar gutter
    boundaries for sidebar lists.
- [Explorer Tree Lifecycle](architecture/explorer-tree-lifecycle.md)
  - File-tree loading, expansion, subtree motion, and indentation guide rules.
- [Desktop Multi-Window Workspaces](architecture/desktop-multi-window-workspaces.md)
  - One-repo-per-window ownership, duplicate-window prevention, and app-level
    recent workspace behavior.
- [Desktop Auto Update Lifecycle](architecture/desktop-auto-update-lifecycle.md)
  - Electron updater ownership, one-click update flow, restart preflight, and
    release-channel behavior.
- [Desktop Menu Surface](architecture/desktop-menu-surface.md)
  - Shared menu background, border, shadow, radius, and component boundary
    rules.
- [Markdown Live Preview Editing UX](architecture/markdown-live-preview-ux.md)
  - Part 1: the durable Typora-class editing contract (per-element syntax
    reveal, composing/commit lifecycle, hidden-marker deletion). Part 2: the
    one-time migration to-do list and code change map.

## Document Boundary

Keep this file short. Add new feature architecture content as a focused document
under `docs/architecture/`, then link it here and from `docs/README.md`.
