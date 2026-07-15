# Agent Composer reference ingestion

Status: normative target contract. The runtime/session foundation exists, but
the complete acquisition, staging, capability and transcript path described
here is not yet implemented. Delivery is tracked by `ISSUE-404`.

This document is the source of truth for adding workspace context and external
attachments to Desktop Agent Chat. It complements the product layout in
[Right Sidebar Agent Chat](right-sidebar.md), the interaction rules in
[Chat UI behavior](chat-ui-behavior-spec.md), and the native ownership model in
[ADR-005](ADR-005-multi-native-agent-backends.md).

## 1. Scope and vocabulary

Composer references are explicit user inputs associated with one draft and one
eventual turn. They are not implicit permission grants, Chat History, workspace
imports or a second native context engine.

```text
workspace context
  A live reference to a file or directory inside the authorized workspace.
  Main resolves it again when the turn starts. A directory is a scope, never a
  request to recursively snapshot every descendant.

staged attachment
  An immutable, short-lived snapshot acquired from an operating-system File
  grant. Main owns its bytes and returns only an opaque token plus bounded
  display metadata to the Renderer.

path-like text
  Text that resembles a path but grants no access by itself. Main may promote
  it to workspace context only after canonical workspace validation.

reference display
  Sanitized metadata rendered in a draft or committed user message. It never
  contains snapshot bytes, a staging token or an external absolute path.
```

The terms `attachment` and `context` must not be treated as interchangeable:
workspace context is live and path-addressed; a staged attachment is an
immutable snapshot with a bounded lifetime.

## 2. Product behavior by source

| Source | Default result | Required rule |
| --- | --- | --- |
| Explorer file | workspace-file context chip | preserve workspace-relative identity; never move the source |
| Explorer directory | workspace-directory scope chip | do not enumerate or upload descendants eagerly |
| Finder/file picker file | staged attachment chip | acquire through a real `File` object and main-owned snapshot |
| pasted image | staged image attachment | use the same staging and capability path as picker/drop |
| workspace-relative path text | context only after main validation | otherwise keep it as ordinary text |
| absolute path or `file://` text | ordinary text | a string is never an external file capability |
| unsupported MIME or directory | visible rejected reference | explain the selected Agent limitation; do not silently omit it |

The complete Chat surface is a valid hit target for recognized file/reference
drags. A valid drag presents a non-layout-changing overlay and highlights the
Composer. Dropping adds references to the draft; it never sends a turn,
imports into the workspace or changes Explorer selection/move state.

The action row exposes one keyboard-accessible `+` menu as the non-drag
equivalent. It includes Add project files and Add external files when those
actions are available. Paste and drag are accelerators, not the only path.

## 3. Ownership and dependency flow

```text
shared-ui Explorer
  emits versioned workspace-entry drag payload
        |
        v
Renderer file-transfer classifier
  classifies typed Explorer entries, File objects and plain text
        |
        +----------------------------+
        |                            |
        v                            v
workspace resolver              preload File acquisition
        |                            |
        v                            v
main workspace authorization    main attachment staging/token registry
        |                            |
        +-------------+--------------+
                      v
          draft-scoped reference state
                      |
                      v
          immutable submission intent
                      |
                      v
          AgentService capability gate
                      |
                      v
          concrete native adapter mapping
                      |
                      v
          normalized turn/reference display
```

Dependency rules:

- `shared-ui` owns the Explorer payload contract but imports no Electron,
  Agent, app-shell or native runtime code.
- Renderer domain code classifies sources and owns draft presentation state;
  it never reads external file bytes.
- preload is the only Renderer-adjacent layer that translates a real Electron
  `File` into an OS path for staging.
- main owns canonical paths, bytes, snapshot storage, tokens, budgets and
  native capability enforcement.
- concrete adapters own protocol-specific input blocks. UI and application
  code consume capabilities and never branch on product IDs.
- Terminal may reuse source classification but keeps shell quoting and PTY
  writes inside the Terminal feature.

## 4. Reference contracts

The public names may evolve during implementation, but the contract must be a
discriminated union with equivalent semantics.

```ts
type AgentDraftReference =
  | {
      id: string;
      kind: "workspace-entry";
      entryType: "file" | "directory";
      relativePath: string;
      displayName: string;
      status: "resolving" | "ready" | "error";
      error?: AgentReferenceError;
    }
  | {
      id: string;
      kind: "staged-attachment";
      token: string;
      displayName: string;
      mime: string;
      size: number;
      status: "resolving" | "ready" | "error";
      error?: AgentReferenceError;
    };

type AgentSubmissionIntent = {
  id: string;
  prompt: string;
  model: string | null;
  mode: string | null;
  references: AgentDraftReference[];
};

type AgentReferenceDisplay = {
  id: string;
  kind: "workspace-file" | "workspace-directory" | "attachment";
  displayName: string;
  relativePath?: string;
  mime?: string;
  size?: number;
};
```

Raw staging tokens exist only in short-lived request state and main's token
registry. `AgentReferenceDisplay` is the only reference representation allowed
in normalized events, projection and rendered user messages.

Deduplication uses a main-authorized canonical identity, not a raw path string
or user-reported filename. Workspace aliases that resolve to the same target
are one reference. Staged attachments may use snapshot identity/hash inside
main without exposing the hash as an authorization token.

## 5. Source classification

Classification order is deterministic:

1. versioned PuppyOne workspace-entry MIME;
2. legacy Explorer path MIME for compatibility;
3. real `DataTransfer.files` or file-kind items;
4. validated workspace-relative text;
5. ordinary text fallback.

The versioned Explorer payload includes a schema version, workspace identity,
relative path, entry type and ordered multi-selection. It does not need an
external absolute path. Legacy newline MIME and `text/plain` may remain for the
Terminal and other drop targets during migration.

`text/plain`, `text/uri-list` and `file://` are never sufficient proof that the
user granted access to an external file. Only a real `File` passing through
preload may enter external staging. Path text can become workspace context only
after main proves that its realpath stays inside the currently authorized root.

Drag state uses an explicit depth/session counter so dragenter/dragleave events
from nested transcript and Composer elements do not flicker the overlay. A
drop target prevents Electron navigation for recognized files even when the
selected Agent rejects their type, then presents the rejection as product UI.

## 6. Main-process staging and authorization

### 6.1 Workspace entries

Workspace context remains path-based. At turn start main:

1. authorizes the requesting webContents and workspace binding;
2. resolves the submitted relative path against the canonical root;
3. realpaths the target and rejects traversal/symlink escape;
4. validates file or directory type against the declared entry type;
5. emits an authorized adapter input and sanitized reference display.

Workspace files are not converted to base64 merely to pass a path to a coding
Agent. An adapter may request a bounded snapshot only when its native protocol
requires one and its capability says so. Direct workspace edits between adding
the chip and pressing Send are intentionally visible to the turn.

### 6.2 External attachments

External acquisition uses a narrow preload method that accepts actual `File`
objects. preload calls `webUtils.getPathForFile` and sends source paths directly
to a staging IPC; it does not return those source paths to Agent UI state.

Main staging:

```text
validate sender/workspace/reference epoch
  -> open source read-only with no-follow protection
  -> fstat regular file and enforce count/byte policy
  -> stream once into a permission-restricted app cache temporary file
  -> fsync/close/hash and atomically publish the snapshot
  -> register opaque random token
  -> return token + bounded name/MIME/size metadata
```

The token is bound to the owning webContents, canonical workspace and draft or
reference-set epoch. Turn start requires the same owner/workspace and then
correlates the consumed reference with the selected live product session.
Tokens are single-use or explicitly leased for a queued intent; they cannot be
replayed from another window, workspace or session.

Snapshot storage is outside the workspace and Git tree. Names are generated by
main rather than copied from an untrusted basename. Permissions are minimal.
Source paths, bytes and tokens are redacted from ordinary logs and Renderer
errors.

Cleanup is mandatory on:

- explicit chip removal or replacement;
- successful consume, unless an immutable queued lease still owns it;
- queue cancellation or expiry;
- new session/runtime reset when ownership cannot transfer safely;
- window destruction and application quit;
- TTL expiry and startup orphan sweep.

The existing combined safety floor of at most 32 references and 25 MiB total
remains the minimum until a reviewed contract changes it. Validation occurs
early enough to present per-file errors, and turn start rechecks authority.

## 7. Runtime input capabilities

The final decision cannot be based only on the legacy
`attachments/contextReferences` booleans. Runtime inspection needs structured
reference input capabilities equivalent to:

```ts
type AgentReferenceInputCapabilities = {
  workspaceFiles: boolean;
  workspaceDirectories: boolean;
  images: "none" | "data-url" | "local-snapshot" | "resource";
  genericFiles: "none" | "local-snapshot" | "resource";
  acceptedMimeTypes?: string[];
  maxReferences: number;
  maxReferenceBytes: number;
  maxTotalReferenceBytes: number;
};
```

The legacy booleans may be retained as a compatibility projection while
contracts migrate, but they are not sufficient product authority.

Adapter rules:

- Codex maps verified workspace references and protocol-supported image inputs
  to exact app-server input types. Generic files remain unsupported until the
  installed protocol and adapter tests prove a transport.
- Claude Code may supply authorized workspace paths through its prompt/session
  contract. Snapshot types are enabled only when the SDK has a documented,
  tested content-block or attachment path.
- OpenCode and PuppyOne Agent derive resource/image/audio behavior from ACP
  prompt capabilities and construct the corresponding native block.
- Unknown capability values, version drift and rejected native inputs fail
  closed. They never trigger an Agent switch or an unbounded prompt fallback.

Capability mapping belongs in concrete adapters and inspection. Renderer and
application code may display the selected Agent's reason, but must not contain
`if runtimeId === "codex"` style behavior.

## 8. Draft, queue, steer and turn lifecycle

Pressing Send atomically captures text, configuration and references into one
immutable `AgentSubmissionIntent`. The optimistic user row renders this same
intent while native session preparation or turn start is pending.

```text
draft owns references
  -> Send captures immutable intent
  -> optimistic user row owns display metadata
  -> main authorizes/consumes references
  -> native turn accepted
  -> authoritative user turn replaces optimistic ownership
  -> draft starts empty
```

If preparation or turn start fails, the intent remains recoverable. Restoration
must not overwrite text or references the user added after the submission
began. A deterministic merge/retry rule is required.

Queue stores complete intents, not strings. Each queued intent owns its staged
token lease and workspace reference list. Draining cannot read the current
Composer arrays. Cancelling or overflowing the queue releases its leases.

Steer may carry references only when the native steer method and capability
explicitly support them. Otherwise the UI either disables reference submission
for steer or states that references are retained for the next ordinary turn.
It must never send text while silently discarding ready chips.

Switching Agent or starting a new session re-evaluates every draft reference.
Unsupported references remain visible as actionable errors until removed or
until a documented transfer/reissue flow succeeds. Tokens never cross native
session ownership accidentally.

An attachment-only send is allowed only when the selected native contract
accepts it. PuppyOne does not synthesize a hidden prompt to bypass a text
requirement.

## 9. Transcript and replay

The authoritative turn event includes bounded `AgentReferenceDisplay` values.
Projection stores them on the user part, and rendering places chips below the
user text inside the same quiet message surface.

Optimistic and authoritative rows share stable reference identities. When
`turn.started` arrives, projection upserts the optimistic row instead of
rendering a duplicate or dropping chips. Replay/resume reconstructs the same
display metadata without accessing staging tokens or source bytes.

Allowed event fields are safe display name, workspace-relative path, entry
type, MIME, size and stable display identity. Forbidden fields are external
absolute path, snapshot path, opaque token, data URL, hash used as authority,
file contents and raw native input blocks.

## 10. Interaction and accessibility contract

- Drop never sends automatically and never moves/imports the Explorer source.
- The overlay changes opacity/color only; it does not resize transcript or
  Composer geometry. Reduced motion removes transitions.
- The `+` control is a stable 30 px action immediately before Send/Stop and has
  menu semantics, an accessible name and Escape/focus-return behavior.
- Chips have remove actions, safe names, status text and an accessible full
  workspace-relative path when applicable.
- Batch results use one polite live announcement and visible per-item error;
  color is not the only valid/invalid signal.
- Keyboard file selection provides the same functionality as drag. IME Enter,
  Shift+Enter and normal text paste remain unchanged.
- RTL changes inline placement but not logical order. Long paths, CJK and mixed
  direction names wrap or ellipsize without horizontal sidebar scrolling.
- A rejected reference explains selected-Agent capability or safety policy;
  it does not blame the filesystem generically or expose a technical path.

## 11. Performance and resource rules

- Renderer receives metadata only, never attachment bytes or base64.
- A batch is bounded before chips mount; no unbounded directory walk occurs.
- Staging streams bytes and does not create simultaneous source, Buffer and
  base64 copies of the full 25 MiB budget.
- Hashing/copying runs outside the Renderer critical path and is cancellable at
  the registry/lifecycle boundary.
- Dragover performs type detection only. It does not call IPC, stat files or
  update React state for every pointer event.
- Chip rendering and live announcements are bounded by the shared reference
  count, and transcript virtualization remains unchanged.

## 12. Required verification

Automated coverage includes:

- Explorer single/multi/read-only drag, directory scope and no move/import;
- nested drag depth, valid/invalid overlay, partial batch and deduplication;
- picker, Finder files, pasted image and path-text non-authorization;
- staging owner/workspace/epoch/TTL, symlink/TOCTOU, type/size/count and cleanup;
- submission failure, concurrent draft edits, queue, steer and runtime switch;
- Codex/Claude/ACP exact capability and native-input fixtures;
- optimistic/authoritative/replay reference display identity;
- keyboard, localization, RTL, reduced motion and architecture boundaries.

Production Electron smoke covers real macOS Finder drag, file picker and paste
at 420, 560 and 760 px in light and dark themes. DOM-only `DataTransfer` tests
do not prove preload File grants or main snapshot cleanup.

## 13. Rejected shortcuts and non-goals

Rejected:

- a textarea-only `onDrop` that submits raw paths;
- allowing arbitrary external paths through workspace authorization;
- silently copying dropped files into the project;
- recursively converting a directory into attachments;
- reading/base64-encoding external files in Renderer;
- backend-ID conditionals in shared UI or application code;
- claiming every file type is supported because a file picker can select it;
- clearing chips before native turn acceptance or omitting them from replay.

This contract does not create cloud attachment storage, durable PuppyOne Chat
History, cross-device synchronization, automatic document extraction or a
universal native file protocol. Those require separate product and security
decisions.
