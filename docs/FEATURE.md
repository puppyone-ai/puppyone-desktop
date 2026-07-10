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
- [Editor and Viewer Architecture](architecture/editor/README.md)
  - Architecture home for file-format routing, source acquisition, committed
    preview lifecycle, viewer boundaries, format-specific editors, and the
    reserved viewer-plugin model.
- [Desktop Sidebar View Stack](architecture/desktop-sidebar-view-stack.md)
  - Keep-alive behavior for the Data, Git, Cloud, and Settings sidebar surfaces.
- [Desktop Sidebar Scroll Lists](architecture/desktop-sidebar-scroll-lists.md)
  - App-wide WebKit-only scrollbar styling rule, reserved scrollbar gutters,
    and scroll area / list padding / row width boundaries for sidebar lists.
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
- [Desktop Appearance Settings](architecture/desktop-appearance-settings.md)
  - Part 1: the durable "curate, don't configure" contract for the Appearance
    surface, plus the accepted/rejected decision record versus
    deep-customization settings pages. Part 2: the implementation record (text size,
    third dark preset, preview cards, reduce motion, pointer cursors, dock
    icon, diff markers).
- [Desktop Terminal Architecture](architecture/desktop-terminal-architecture.md)
  - Part 1: the durable terminal contract (xterm + node-pty layering, the
    character-grid width invariant, CJK `text-spacing-trim` failure mode,
    fit/resize pipeline). Part 2: the remediation to-do list (spacing-trim
    CSS fix, WebGL renderer with fallback, Unicode 11 widths).

## Document Boundary

Keep this file short. Add new feature architecture content as a focused document
under `docs/architecture/`, then link it here and from `docs/README.md`.
