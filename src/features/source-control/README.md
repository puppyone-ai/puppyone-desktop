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
- `WorkingFileDetail.tsx` composes local file actions and canonical file surfaces for the focused diff route.
- `diff/GitFileDiffSurface.tsx` is the single fact-first file-level visual contract used by focused Changes and embedded History. Its type label and renderer share one Diff Registry resolution.

Keep Git command execution in the local API layer. Keep feature state derivation in `viewModel.ts`. Keep components mostly presentational so simple/professional mode, GitHub/Puppyone remote behavior, and future sync actions can evolve without rewriting the whole sidebar.
