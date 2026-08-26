# Source Control Feature

This folder owns the Desktop source-control experience.

Durable architecture and lifecycle contracts live in
[Git and Source Control Architecture](../../../docs/architecture/git/README.md).
Keep this file as the code-local ownership map rather than duplicating those
contracts here.

- `types.ts` defines local UI contracts shared across the feature.
- `remotes.ts` parses, masks, and compares Git remote URLs.
- `viewModel.ts` derives source-control state from the raw Git snapshot. Keep button labels, enabled states, display modes, and remote/commit counts here instead of inside TSX views.
- `gitRefreshScheduler.ts` owns cancellable single-flight reads, root epochs,
  generation ordering, retry and focus reconciliation.
- `remoteRefreshPolicy.ts` derives the effective GitHub, PuppyOne Cloud, or
  generic Git fetch target and foreground refresh cadence. It is pure policy;
  timers and IPC stay in the repository lifecycle.
- `repositoryRefreshPolicy.ts` maps structured repository-change causes to
  history invalidation without encoding semantics in log strings.
- `useGitRepositoryLifecycle.ts` owns watcher bootstrap, repository contexts,
  status publication, focus reconciliation, cancellation and history updates.
- `useDesktopGitController.ts` coordinates one window-local repository and must
  keep UI selection and user operations above that lifecycle boundary.
- `components.tsx` contains reusable Git list primitives such as section headers, preview rows, and working-tree rows.
- `VersionControlIcon.tsx` owns the canonical Version Control icon shared by navigation, menus, and the opt-in state.
- `VersionControlSetupState.tsx` owns the full-page opt-in state for a local workspace that has not enabled version control.
- `SourceControlSidebar.tsx` composes the sidebar flow and wires user actions to the view model.
- `sidebar/GitLocalStatusSection.tsx` owns the shared flat local disclosure
  contract; committed, staged, unstaged, and merge sections compose their
  domain-specific contents through it. Local work must not reuse the provider
  status-card surface.
- `sidebar/GitLocalStatusPanels.tsx` owns those four local panel configurations,
  resource bodies, and action placement so `SourceControlSidebar.tsx` remains
  an orchestration boundary rather than a second presentation module.
- `sidebar/GitSidebarProviders.tsx` owns GitHub and PuppyOne Cloud provider
  presentation. Providers reuse canonical Empty, preview, and operation-button
  primitives and must not execute Fetch themselves.
- `sidebar/GitRemoteSections.tsx` owns generic remote state and the publish
  reminder; `sidebar/GitSidebarPrimitives.tsx` owns operation, disclosure,
  resize, loading, and History controls.
- `sidebar/useGitSidebarExpansionState.ts` owns keyed disclosure state. All
  current Git panels intentionally start expanded.
- `styles/sidebar-panels.css`, `sidebar-actions.css`,
  `sidebar-providers.css`, and `sidebar-resources.css` own distinct visual
  domains. Do not restore a late source-control override stylesheet to solve
  selector-order conflicts.
- `WorkingFileDetail.tsx` composes local file actions and canonical file surfaces for the focused diff route.
- `diff/GitFileDiffSurface.tsx` is the single fact-first file-level visual contract used by focused Changes and embedded History. Its type label and renderer share one Diff Registry resolution.

Keep Git command execution in the local API layer. Keep feature state derivation in `viewModel.ts`. Keep components mostly presentational so simple/professional mode, GitHub/Puppyone remote behavior, and future sync actions can evolve without rewriting the whole sidebar.
