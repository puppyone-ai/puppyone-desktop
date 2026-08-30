# Desktop Multi-Root Workspace Kernel

## Status

The invisible foundation is implemented. PuppyOne Desktop still exposes one
folder per window and deliberately renders the same Header, Explorer, tabs,
Git, Cloud, Agent, and terminal product as before. Internally, that folder now
occupies `WorkbenchWorkspace.folders[0]`; resource and authorization contracts
no longer require the folder count to remain one.

Multi-root presentation, Add/Remove Folder commands, aggregate Explorer roots,
and aggregate Source Control are not enabled. They must be built on this kernel
rather than reintroducing a parallel multi-root mode.

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
surface, cache graph, or compatibility application. Current UI consumes the
first Folder's legacy `Workspace` projection while the underlying state uses
the general composition.

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

The Renderer lifecycle currently creates a single-folder Workbench Workspace
for every activated legacy Workspace. This exercises the plural model without
changing product behavior.

### Main window composition

`electron/main/window-workspace-state.mjs` owns one window's ordered Folder
composition. Scalar `workspacePath` and `workspace` authority have been removed
from window state. The current open/replace flow still writes one Folder, while
the state and duplicate-path accounting support an ordered collection.

`workspaceWindowByPath` remains the application-level duplicate-window index.
When multi-root commands are later enabled it must index every attached
canonical local Folder path.

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

### Editor identity with unchanged presentation

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

Until the product gate is opened:

- folder count remains one in production UI;
- Root headers are not rendered;
- Header and recent-workspace commands retain current behavior;
- Explorer rows and breadcrumbs retain current labels and geometry;
- tabs retain current labels;
- Source Control and Cloud retain the current repository presentation;
- App Preview, Agent, and terminal launches retain current commands;
- old Editor records restore through the migration parser;
- no new experiment, setting, locale string, or navigation entry is exposed.

Tests assert that the Editor's visible active path remains unchanged while its
internal ID becomes Root-aware.

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

## Remaining Adoption Sequence

1. Move local `DataPort` behind a URI-routed FileService/Provider registry.
2. Add a main-owned attach/detach IPC transaction and a composition persistence
   store separate from recents.
3. Convert Explorer node/selection/expansion keys to Resource URI and assemble
   one ordered multi-root visible model.
4. Convert Git, Cloud, App Preview, plugins, settings, clipboard, and all
   background request epochs to explicit Folder targets.
5. Enable Add/Remove/Reorder Folder presentation behind a product gate.
6. Add cross-root copy and only then design transactional cross-root move.

No step may expose the UI before its lower-layer identity, authority, cleanup,
restore, and stale-result tests pass.

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
