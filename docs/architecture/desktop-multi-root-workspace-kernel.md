# Desktop Multi-Root Workspace Kernel

## Status

The multi-root kernel and product presentation are implemented. One native
window can own one or many ordered Workspace Folders. With one Folder, the
Explorer remains flat and visually compatible with the original product. With
multiple Folders, the same Explorer renders one expandable root row per
Project; files from every root share the Editor Workbench without sharing
identity.

The Header's Add Project flow can attach a registered Project or select a new
folder. Removing a Project revokes only that Folder's authority and services.
Source Control, Cloud, Agent, Terminal, address-bar routing, and App Preview
derive their target from the active Resource URI; Source Control is focused-
Folder presentation rather than an aggregate multi-repository list.

This document owns resource identity, Workspace composition, folder lifecycle,
window authority, and root-scoped runtime cleanup. Multi-window ownership stays
in [Desktop Multi-Window Workspaces](desktop-multi-window-workspaces.md).

## Decision

The kernel has three independent identities:

```text
WorkbenchWorkspace
  one native window's zero / one / many-folder composition

WorkspaceFolder
  one attached local or provider-backed root

ResourceUri
  one globally unambiguous file or directory
```

Single-root behavior is `folders.length === 1`, not a separate reducer, IPC
surface, cache graph, or compatibility application. Legacy `Workspace`
projections exist at provider boundaries, while routing uses the owning
`WorkspaceFolder` resolved from a Resource URI.

Cloud Project ID, Git repository identity, local checkout identity, Workspace
composition ID, Folder ID, Resource URI, and native window ID remain distinct.

## Implemented Foundation

### Resource URI and identity

`packages/shared-ui/src/core/resourceUri.ts` provides:

- opaque `ResourceUri` values;
- provider scheme, authority, and normalized path parsing;
- stable logical URI roots for attached local folders;
- path traversal rejection;
- provider-aware case sensitivity;
- equality, parent/descendant, relative-path, join, and rebase operations.

Feature code must not reproduce these rules with raw `startsWith`, lowercase
paths, display labels, or synthetic strings such as `root-a/src/App.tsx`.

A local logical resource currently has this shape:

```text
puppyone-local://workspace/<folder-id>/src/App.tsx
```

The absolute filesystem path remains main/provider authority. The logical URI
is safe to use as Editor, persistence-metadata, cache, event, and selection
identity without confusing it with an operating-system path.

### Workspace Context

`packages/shared-ui/src/core/workbenchWorkspace.ts` defines immutable
`WorkbenchWorkspace` and `WorkspaceFolder` snapshots plus
`WorkbenchWorkspaceContext`.

The Context:

- supports zero, one, or many ordered Folders;
- assigns a monotonically increasing revision;
- rejects duplicate Folder identity;
- resolves a Resource URI to the most specific owning Folder;
- serializes concurrent attach, detach, reorder, and replace operations;
- emits `onWillChangeWorkspaceFolders` and
  `onDidChangeWorkspaceFolders` events;
- waits for asynchronous durability barriers before publishing removal;
- can veto unsafe removal without exposing a partial snapshot.

The Renderer lifecycle restores and reconciles the complete ordered Folder
composition. Attach and detach update the same Context and revision stream.

### Main window composition

`electron/main/window-workspace-state.mjs` owns one window's ordered Folder
composition. Scalar `workspacePath` and `workspace` authority have been removed
from window state. The current open/replace flow still writes one Folder, while
the state and duplicate-path accounting support an ordered collection.

`workspaceWindowByPath` remains the application-level duplicate-window index
and indexes every attached canonical local Folder path.

### Sender-bound Folder capabilities

`electron/main/workspace-authorization.mjs` accepts the complete set of Roots
assigned to the IPC sender. Every requested Root is realpathed and must equal
one entry in that set. If more than one Root is attached, omitting the requested
Root fails closed because there is no safe implicit default.

The old scalar getter remains only as a compatibility adapter for focused tests
and isolated call sites. Application window state uses the plural getter.

Recent Workspace metadata is never authority. A recent folder, Cloud Project,
Git remote, visible Explorer row, or Renderer-provided absolute path cannot
mint a Folder capability.

### Editor and Explorer identity

`EditorInput` separates:

```text
id / resourceUri   Root-aware global identity
resource           current workspace-relative host/display path
label              presentation only
```

The live Desktop Editor controller supplies the active Folder URI, so two
Folders can both open `src/App.tsx` without sharing an Editor ID. Existing
Viewer and file ports continue to receive `resource`, preserving current UI and
storage calls.

Persisted legacy path-only Editor records are migrated during parsing. Pane
references are remapped to the new URI IDs before layout validation. The
visible `activePath` remains workspace-relative; command routing uses the new
`activeEditorId`.

Working Copies remain keyed by stable storage identity plus canonical provider
path. This already isolates equal paths in different local roots. Pane ID,
Editor ID, Working Copy identity, and display path must not collapse into one
field.

### Root-scoped native runtime cleanup

Terminal sessions now retain their canonical Workspace Root and expose scoped
cleanup for one window/Root pair. Agent sessions already retain Workspace Root;
their service and attachment store now expose the same scoped cleanup.

Removing Folder A can therefore retire its Agent and terminal resources
without touching Folder B. Window close still invokes the broader window-owned
cleanup path.

Workspace and Git watcher services already maintain root-aware subscriptions.
Future detach coordination must stop only subscriptions belonging to the
removed Folder.

## Dependency Direction

```text
WorkbenchWorkspace snapshot
          |
WorkspaceContextService
          |
          +-------- UriIdentityService -------- Editor / Explorer identity
          |
          +-------- root-scoped feature registries
          |
       FileService
          |
FileSystemProvider registry
          |
 local | Cloud | future providers

Electron main
  WindowWorkspaceState
          |
  sender -> authorized Folder capabilities
```

The provider-facing `FileService` is the next storage migration boundary. The
existing root-closed `DataPort` is compatible as a local provider adapter, but
new Renderer APIs must not expand `(rootPath, relativePath)` usage.

## Folder Change Transaction

Attach follows:

```text
candidate selection
  -> main canonicalization and symlink policy
  -> stable Folder identity
  -> duplicate/cross-window ownership check
  -> explicit capability and trust state
  -> provider/runtime preparation
  -> immutable snapshot publication
  -> onDidChange(added)
```

Detach follows:

```text
remove request
  -> onWillChange(removed)
  -> join dirty Working Copy / mutation / Agent / terminal barriers
  -> publish one new revision
  -> revoke only that Folder capability
  -> dispose only that Folder's services
  -> onDidChange(removed)
```

Failure before publication leaves the old snapshot authoritative. A late async
result captures `{ workspaceId, folderId, revision }` and cannot populate a
newer context after its Folder is removed.

## Service Ownership Target

Each feature owns its own Folder-keyed state. There is no monolithic
`MultiRootRuntime`.

| Domain | Ownership rule |
| --- | --- |
| Explorer | lazy tree, loading, selection, and expansion per Folder; one combined virtual window |
| Editor | URI-keyed Inputs shared in one Workbench; labels disambiguate only on collision |
| Working Copy | stable storage identity plus provider path |
| File watcher | sender + Folder subscription token |
| Git | repository state, request epoch, mutations, and watcher per Folder |
| Cloud | canonical-remote Project resolution per Folder |
| Agent | every session bound to one explicitly granted Root |
| Terminal | every PTY bound to one Root and validated `cwd` |
| Settings | application, Workbench Workspace, Folder, then resource scopes |
| Trust/plugins | capability and trust state of the resource-owning Folder |
| Clipboard | source URI and Folder; cross-provider move requires a real transaction |

Active Folder is derived from the active Resource URI or supplied explicitly by
a command. Services must not silently fall back to `folders[0]` after multi-root
presentation is enabled.

## Single-Root Compatibility Contract

When exactly one Folder is attached:

- no synthetic Root header is rendered;
- Explorer rows retain their 30 px geometry, labels, and commands;
- tabs retain current labels;
- Source Control, Cloud, App Preview, Agent, and Terminal behave as before;
- old Editor records restore through the migration parser;
- adding a second Project upgrades the live composition without opening a
  second application shell.

Tests assert both the flat single-Folder tree and the combined multi-Folder
tree, including same-named documents in different roots.

## Non-Negotiable Invariants

1. Zero, one, and many Folders use the same types and lifecycle.
2. Relative path alone is not global identity.
3. Renderer cannot mint local-root authority.
4. Main owns canonical local paths and attached Folder capabilities.
5. Recent history is metadata, not authorization.
6. Multi-folder IPC requires an explicit target Root.
7. Detaching one Root never resets sibling Root resources.
8. Dirty Working Copies cross a pre-change barrier before capability revocation.
9. Folder reorder changes presentation order, not runtime identity.
10. One-folder UI remains behaviorally and visually unchanged.
11. No `multiRootMode` branch or second kernel is introduced.
12. Display name, local path, Git identity, Cloud identity, and Workspace ID are
    never substituted for Resource URI or Folder ID.

## Rejected Designs

- Adding `roots[]` beside a mutable `activeWorkspace` leaves ambiguous ambient
  authority.
- Mounting one complete `DataWorkspace` application per Root duplicates Editor,
  navigation, auxiliary panels, and command routing.
- Prefixing relative paths with Root names uses mutable, non-unique display
  values as identity.
- Authorizing all recent folders grants filesystem access without current user
  intent.
- Maintaining separate single-root and multi-root kernels guarantees drift in
  restore, security, and cleanup behavior.

## Delivered Adoption Sequence

1. Local `DataPort` is behind a URI-routed Workbench data service with one
   root-closed provider per Folder.
2. Main owns attach/detach transactions and ordered composition persistence.
3. Explorer node, selection, expansion, Editor, and Working Copy identities use
   Resource URIs.
4. Git, Cloud, App Preview, Agent, Terminal, address-bar, external-open, and
   create/import/file operations resolve an explicit owning Folder.
5. Add/Remove Project presentation is enabled without changing single-root row
   geometry.
6. Cross-root copy uses a privileged operation that authorizes both source and
   destination roots independently.

Cross-root move remains intentionally non-atomic and is rejected. It must not
be presented until a crash-safe copy/delete transaction and rollback policy are
defined. Folder reorder can be added as presentation over the existing ordered
Context without changing resource identity.

## Verification

The kernel test matrix covers:

- URI normalization, traversal rejection, case policy, ancestry, and rebase;
- same relative path in different Roots;
- zero/one/many immutable Workspace snapshots;
- most-specific Folder resolution for overlapping provider roots;
- serialized concurrent mutations and duplicate rejection;
- asynchronous detach barriers and revision publication;
- sender authorization across multiple Roots and immediate revocation;
- scalar IPC compatibility;
- ordered main window compositions and scoped change sets;
- legacy Editor restore into Root-aware IDs;
- unchanged visible Editor paths;
- root-scoped Agent, attachment, and terminal cleanup;
- existing workspace security, Editor, Working Copy, and window lifecycle
  regression suites.

Repository gates remain:

```bash
npm test
npm run lint
npm run check:boundaries
npm run build
```

## References

- [VS Code Multi-root Workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces)
- [Adopting Multi Root Workspace APIs](https://github.com/microsoft/vscode/wiki/Adopting-Multi-Root-Workspace-APIs)
- [VS Code workspace model](https://github.com/microsoft/vscode/blob/main/src/vs/platform/workspace/common/workspace.ts)
- [VS Code URI Identity Service](https://github.com/microsoft/vscode/blob/main/src/vs/platform/uriIdentity/common/uriIdentity.ts)
- [VS Code Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)
