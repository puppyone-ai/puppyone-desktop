# Documentation

This directory contains project documentation for PuppyOne Desktop.

## Architecture

Architecture docs record durable product and frontend decisions. Start with
[FEATURE.md](FEATURE.md) for the short index, or open a focused document
directly:

- [Cloud Workspace State Boundaries](architecture/cloud-workspace-state.md)
- [Automation and Plugin Domain Boundary](architecture/automation-plugin-domain-boundary.md)
- [Git and Source Control Architecture](architecture/git/README.md)
  - Local Source Control sidebar, repository status freshness, external Git
    invalidation, and Cloud branch graph topology.
- [Editor and Viewer Architecture](architecture/editor/README.md)
  - File format routing, preview lifecycle, viewer boundaries, and
    format-specific editors including Markdown.
- [Desktop Sidebar View Stack](architecture/desktop-sidebar-view-stack.md)
- [Desktop Sidebar Scroll Lists](architecture/desktop-sidebar-scroll-lists.md)
- [Explorer Tree Lifecycle](architecture/explorer-tree-lifecycle.md)
- [Desktop Renderer Performance](architecture/desktop-renderer-performance.md)
- [Desktop Multi-Window Workspaces](architecture/desktop-multi-window-workspaces.md)
- [Desktop Session, Workspace Identity, and Cache Lifecycle](architecture/desktop-session-workspace-cache-lifecycle.md)
- [Desktop Auto Update Lifecycle](architecture/desktop-auto-update-lifecycle.md)
- [Desktop Menu Surface](architecture/desktop-menu-surface.md)
- [Desktop Appearance Settings](architecture/desktop-appearance-settings.md)
- [Desktop Terminal Architecture](architecture/desktop-terminal-architecture.md)
- [Desktop Agent Architecture](architecture/desktop-agent/README.md)

## Release

- [Release](RELEASE.md) documents release setup, GitHub Actions secrets,
  internal unsigned macOS builds, and production signing.
- [Desktop App Icon](DESKTOP_APP_ICON.md) documents the app icon source of
  truth, generated assets, packaging rules, and Dock icon verification.
