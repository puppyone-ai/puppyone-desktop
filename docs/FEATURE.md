# Desktop Feature Architecture

This file is the index for durable product and frontend architecture decisions
for PuppyOne Desktop. Feature-specific guidance lives in focused documents so a
single product area can evolve without turning this file into a catch-all.

## Architecture Documents

- [Cloud Workspace State Boundaries](architecture/cloud-workspace-state.md)
  - Cloud environment, auth, workspace binding, project data, and route-state
    boundaries.
- [Local and Cloud UX](architecture/local-and-cloud-ux.md)
  - One Projects entry and one Project shell across Local Only, Local + Cloud,
    and Cloud Only, including creation, transitions, visual semantics, Files
    source selection, and Cloud-service eligibility.
- [Automation and Plugin Domain Boundary](architecture/automation-plugin-domain-boundary.md)
  - Cloud information-source Automation and local-only file-viewer Plugins
    have separate authority, storage, permissions, lifecycle, and source
    ownership.
- [Git and Source Control Architecture](architecture/git/README.md)
  - Local Source Control sidebar and status ownership, external Git refresh
    lifecycle, Git topology source of truth, and branch/ref display rules.
- [Editor and Viewer Architecture](architecture/editor/README.md)
  - Architecture home for file-format routing, source acquisition, committed
    preview lifecycle, the versioned preset Viewer Contract, format-specific
    editors, and the dormant external Viewer Pack adapter boundary.
- [Desktop Sidebar View Stack](architecture/desktop-sidebar-view-stack.md)
  - Keep-alive behavior for the Data, Git, Cloud, and Settings sidebar surfaces.
- [Desktop Sidebar Scroll Lists](architecture/desktop-sidebar-scroll-lists.md)
  - App-wide WebKit-only scrollbar styling rule, reserved scrollbar gutters,
    and scroll area / list padding / row width boundaries for sidebar lists.
- [Explorer Tree Lifecycle](architecture/explorer-tree-lifecycle.md)
  - File-tree loading, expansion, subtree motion, and indentation guide rules.
- [Desktop Multi-Window Workspaces](architecture/desktop-multi-window-workspaces.md)
- [Desktop Session, Workspace Identity, and Cache Lifecycle](architecture/desktop-session-workspace-cache-lifecycle.md)
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
- [Desktop Agent Architecture](architecture/desktop-agent/README.md)
  - Existing Terminal plus an independent right-sidebar Agent Chat. PuppyOne
    owns one UI, control plane, safety boundary and event contract over multiple
    native Agent backends. PuppyOne Agent uses a managed OpenCode kernel;
    Codex, Claude Code, user OpenCode and future supported products keep their
    own harness, login and native session. See the
    [multi-native backend decision](architecture/desktop-agent/ADR-005-multi-native-agent-backends.md).

## Document Boundary

Keep this file short. Add new feature architecture content as a focused document
under `docs/architecture/`, then link it here and from `docs/README.md`.
