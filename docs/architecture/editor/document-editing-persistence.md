# Document Editing and Persistence Architecture

**Status:** Authoritative architecture.

PuppyOne standardizes the save lifecycle, not the internal design of every
editor. A format contribution owns editing and serialization. A small,
host-owned `DocumentEditingSession` makes the latest snapshot durable and
prevents navigation from discarding an unsaved document.

This is intentionally not a multi-agent coordinator, operation log, CRDT, or
format-independent merge engine.

## 1. Decision

The stable boundary is:

```text
Explorer / DataWorkspace
          |
          v
EditorHost + Viewer Router
          |
          +----> read-only Viewer Contribution
          |
          `----> editable Editor Contribution
                       |
                       | revision change + readSnapshot()
                       v
              DocumentEditingSession
                       |
                       | path + content + baseVersion
                       v
              DocumentPersistencePort
                       |
                 +-----+-----+
                 |           |
                 v           v
             Local FS      Cloud
```

The responsibilities are deliberately narrow:

1. The **Viewer Router** chooses a contribution.
2. The **Editor Contribution** owns the format, UI, document model, undo/redo,
   validation, and serialization.
3. The **DocumentEditingSession** owns dirty/save state, one serialized write
   path, and flush-before-navigation.
4. The **Persistence Port** owns storage-specific reads and writes.

The router never writes files. An editor never imports Electron, Node `fs`, or
a Cloud client. The session never parses Markdown, CSV, JSON, or PuppyFlow.

## 2. Editor contribution contract

An editable contribution may use any internal model:

- CodeMirror or Monaco state for text;
- React state for a form editor;
- rows and cells for CSV;
- nodes and edges for PuppyFlow;
- another reviewed model appropriate to its format.

It must expose only the small source boundary required by the host:

```text
initial content + storage version
              |
              v
        format-specific Editor
              |
              +----> reportRevision({ revision, dirty })
              |
              `----> readSnapshot() -> { revision, content }
```

The contribution owns `parse()` and `serialize()` when it uses a structured
model. The snapshot is the complete canonical file representation that should
be persisted at that revision.

The contribution does not own:

- autosave timers or write queues;
- file-switch, workspace-switch, or window-close behavior;
- filesystem or Cloud transport;
- storage-version advancement;
- retry policy or save-status presentation.

An embedded third-party editor may be wrapped without changing its internals.
Its adapter reports changes and reads the editor's current value. If the
embedded editor has its own filesystem autosave, that path must be disabled so
the file does not have two independent writers.

## 3. Thin DocumentEditingSession

There is one `DocumentEditingSession` for each open editable document. It is a
small save-lifecycle object, not a global document model and not an exclusive
editing lock.

It owns only:

- `currentRevision` and `persistedRevision`;
- `clean`, `dirty`, `saving`, `saved`, and `error` status;
- the latest exact source snapshot;
- the storage version read with the document;
- at most one in-flight persistence request for that document;
- the newest pending snapshot when edits arrive during a write;
- `requestSave()` and `flushCurrent()`.

It does not own:

- `actorId` or `operationId`;
- format-specific mutations;
- paragraph, cell, node, or edge merging;
- automatic rebase;
- CRDT or OT state;
- cross-document agent scheduling.

The current auto-save mode makes a changed revision eligible for persistence
without requiring every contribution to implement its own timer. Physical
writes remain single-flight: if another edit arrives during a write, the
session keeps the newest pending snapshot and writes it after the current
request finishes.

```text
edit R11 ----> write R11 starts
edit R12 --+
edit R13 --+----> pending becomes R13
                       |
R11 acknowledged -----+
                       |
                       `----> write R13
```

This serialization protects the storage path. It does not prevent the user
from continuing to type and does not block other documents.

## 4. Persistence boundary

Every editable contribution uses the same host-owned port:

```text
DocumentEditingSession
          |
          | persist({ path, content, baseVersion, reason })
          v
DocumentPersistencePort
          |
          +----> Local DataPort
          |        |
          |        v
          |     Electron preload
          |        |
          |        v
          |     workspace:write-file
          |        |
          |        v
          |     authorized atomic writer
          |        |
          |        v
          |     workspace file
          |
          `----> Cloud DataPort -> versioned Cloud commit
```

Local writes remain authorized, version-checked, and replacement-safe. The
renderer supplies the expected storage version; Electron Main validates the
workspace root and performs the atomic write. A successful response returns a
new storage version to the session.

Local and Cloud ports may use different transports. That difference must not
appear inside Markdown, CSV, or another editor contribution.

## 5. Navigation and close

React cleanup is an emergency safety net, not the primary save command.
Anything that can remove an editable surface must wait for the relevant
session before changing destructive navigation state.

```text
file switch / leave editor / workspace switch / window close
                              |
                              v
                  flushActiveDocumentSessions()
                              |
                    +---------+---------+
                    |                   |
                    v                   v
               all succeeded       any failed
                    |                   |
                    v                   v
              allow navigation     keep Editor mounted
                                    show save error
                                    allow retry
```

`activeDocumentSessions` is only a registry used by these navigation gates. It
does not merge content or coordinate agents.

The saved state means the newest editor revision has been acknowledged by
storage. Dispatching a request or starting a timer is not success.

## 6. External changes and agents

The initial concurrency policy is conservative and file-based, similar to a
traditional local editor:

```text
Agent or another program changes the workspace file
                       |
                       v
                 workspace watcher
                       |
             +---------+---------+
             |                   |
             v                   v
       Editor is clean      Editor is dirty
             |                   |
             v                   v
       reload new file      do not overwrite
                            report external-change conflict
                            offer compare / reload / keep current
```

The storage version precondition is the final guard: a dirty editor may not
blindly overwrite a file that changed after it was read.

PuppyOne does not currently promise simultaneous paragraph-level editing by a
human and multiple agents. If that product requirement becomes real,
format-specific merge support belongs behind the relevant contribution:

```text
Markdown Contribution -> optional text diff / three-way merge
CSV Contribution      -> optional cell-aware merge
PuppyFlow Contribution -> optional node-id-aware merge
```

It must not turn the shared `DocumentEditingSession` into a universal mutation
engine. CRDT, OT, and operation logs require a separate product and architecture
decision.

## 7. Adding a new editor

For a normal single-file editor, the integration footprint is:

```text
new-editor/
  EditorComponent.tsx       # format-specific UI and model
  contribution.ts           # match, capability, render/load registration
  sourceAdapter.ts          # reportRevision + readSnapshot
  EditorComponent.test.tsx  # format and round-trip behavior
```

Adding it should require:

1. declaring the supported format/viewer contribution;
2. rendering the editor from initial content;
3. reporting a changed revision;
4. returning the exact serialized snapshot;
5. passing the shared editable-contribution conformance tests.

It should not require changes to `DataWorkspace`, `EditorHost`,
`DocumentEditingSession`, Local/Cloud ports, Electron IPC, or window-close
coordination.

The expected cost by editor type is:

| Editor type | Integration cost | Shared architecture change |
| --- | --- | --- |
| Read-only viewer | very low | none; no session |
| Text-backed single file | low | none |
| Structured model serialized to one text file | low to medium | none |
| Binary editor | medium | add a reviewed binary persistence capability once |
| One edit spanning multiple files | high | separate multi-file transaction design |

Do not generalize the common contract for binary or multi-file cases until a
real editor requires that capability.

## 8. Extension and security boundary

Built-in editable contributions receive the trusted revision/snapshot bridge.
Viewer Pack v1 remains read-only and receives no session or persistence port.
A future editable third-party API would require a separately reviewed,
host-mediated capability; it must not expose raw `fs`, Electron IPC, Cloud
clients, or the session object itself.

Automation, containers, terminals, and agents are separate subsystems. They
may modify workspace files through an authorized capability, but they do not
replace the editor's save lifecycle.

## 9. Implementation placement

```text
packages/shared-ui/src/editor/
  PuppyoneEditorHost.tsx           # route and attach editable boundary
  viewers/*                        # format-specific contributions

packages/shared-ui/src/editor/document-session/
  DocumentEditingSession.ts        # thin save lifecycle
  DocumentSessionBoundary.tsx      # React lifetime/status bridge
  activeDocumentSessions.ts        # navigation/close flush registry
  types.ts                         # revision, snapshot, persistence contracts

packages/shared-ui/src/data/
  DataWorkspace.tsx                # committed preview + file-switch gate

src/lib/
  localFiles.ts                    # Local persistence port
  cloudDataPort.ts                 # Cloud persistence port

electron/main + local-api/
  workspace write IPC              # authorization + atomic local write

src/App.tsx + src/main.tsx
  editor/workspace/window navigation gates
```

## 10. Required invariants

- Viewer routing is deterministic and has no persistence side effects.
- A format contribution owns its model and canonical serialization.
- An editable contribution exposes revision changes and an exact snapshot; it
  does not write storage directly.
- `DocumentEditingSession` stays format-agnostic and small.
- One document has at most one persistence request in flight per session.
- File, editor-surface, workspace, and normal window close await pending saves.
- A failed save keeps the document dirty and visible; errors are not swallowed.
- A storage-version mismatch never becomes a blind overwrite.
- External changes reload a clean editor or produce an explicit conflict for a
  dirty editor.
- Read-only Viewer Packs receive no editing or persistence authority.
- Adding a normal text-backed or structured single-file editor does not require
  changes to the shared save or storage layers.

The shared conformance suite for every editable contribution should prove:

1. an edit produces a new revision and exact snapshot;
2. a successful save advances the acknowledged storage version;
3. a failed save remains visible and retryable;
4. file/workspace/window navigation waits for the latest snapshot;
5. an external storage-version mismatch does not overwrite either side.

Crash recovery drafts, automatic format-specific merge, CRDT, and multi-file
transactions are explicit future capabilities. They are not requirements of
the current Editor architecture.
