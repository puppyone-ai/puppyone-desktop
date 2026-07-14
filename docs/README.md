# Documentation

This directory contains project documentation for PuppyOne Desktop.

## Architecture

Architecture docs record durable product and frontend decisions. Start with
[FEATURE.md](FEATURE.md) for the short index, or open a focused document
directly:

- [Cloud Workspace State Boundaries](architecture/cloud-workspace-state.md)
- [Local and Cloud UX](architecture/local-and-cloud-ux.md)
  - One Projects entry, one Project shell, and the Local Only, Local + Cloud,
    and Cloud Only capability states.
  - Defines binding/canonical-remote Project-context resolution, the strict
    boundary between contextual Cloud navigation and the global Project
    catalog, recovery states, and the unchanged Version Engine boundary.
- [Automation and Plugin Domain Boundary](architecture/automation-plugin-domain-boundary.md)
- [Cloud Automation UX and Architecture](architecture/cloud-automation-ux.md)
  - Automation product definition, UX contract for creation and management,
    and the desktop/server architecture behind it.
- [Git and Source Control Architecture](architecture/git/README.md)
  - Local Source Control sidebar, repository status freshness, external Git
    invalidation, and Cloud branch graph topology.
- [Editor and Viewer Architecture](architecture/editor/README.md)
  - File format routing, preview lifecycle, viewer boundaries, and
    format-specific editors including Markdown.
- [Desktop Sidebar Architecture](architecture/desktop-sidebar-architecture.md)
  - Architecture home for left workspace sidebars, right auxiliary panels,
    feature-owned compositions, the Workspace Surface Registry, shared
    primitives, CSS ownership, performance, and the target directory layout.
  - [Desktop Sidebar View Stack](architecture/desktop-sidebar-view-stack.md)
    defines keep-alive lifecycle when left workspace surfaces change.
  - [Desktop Sidebar Scroll Lists](architecture/desktop-sidebar-scroll-lists.md)
    defines scroll area, list, row, and scrollbar geometry.
- [Explorer Tree Lifecycle](architecture/explorer-tree-lifecycle.md)
- [Desktop Renderer Performance](architecture/desktop-renderer-performance.md)
- [Desktop Multi-Window Workspaces](architecture/desktop-multi-window-workspaces.md)
- [Desktop Session, Workspace Identity, and Cache Lifecycle](architecture/desktop-session-workspace-cache-lifecycle.md)
- [Desktop Auto Update Lifecycle](architecture/desktop-auto-update-lifecycle.md)
- [Desktop Menu Surface](architecture/desktop-menu-surface.md)
- [Desktop Minimal Mode](architecture/desktop-minimal-mode.md)
- [Desktop Appearance Settings](architecture/desktop-appearance-settings.md)
- [Desktop Internationalization and Localization](architecture/desktop-localization.md)
  - Eight-language product scope, locale ownership across Renderer/Shared UI/
    Electron/Cloud/Agent/Plugins, message and error contracts, RTL, packaging,
    testing, and staged migration.
- [Desktop Terminal Architecture](architecture/desktop-terminal-architecture.md)
- [Desktop Agent Architecture](architecture/desktop-agent/README.md)
  - [Multi-Native Agent Backend Decision](architecture/desktop-agent/ADR-005-multi-native-agent-backends.md)
  - [Native Harness Adapter and ACP Decision](architecture/desktop-agent/ADR-006-native-harness-adapters-and-acp.md)
  - One shared PuppyOne UI and control plane over PuppyOne Agent, Codex,
    Claude Code, user OpenCode and capability-gated future native Agents.
    PuppyOne caches the last Agent selection and sanitized local detection,
    while conversation history remains entirely provider-owned.

## Release

- [Release](RELEASE.md) documents release setup, GitHub Actions secrets,
  internal unsigned macOS builds, and production signing.
- [Desktop App Icon](DESKTOP_APP_ICON.md) documents the app icon source of
  truth, generated assets, packaging rules, and Dock icon verification.
