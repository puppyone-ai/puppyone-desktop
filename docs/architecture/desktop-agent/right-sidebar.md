# Right Sidebar Agent Chat

This document defines the target product, layout, lifecycle, and accessibility
contract for Agent Chat in PuppyOne Desktop's resizable right sidebar. The
current implementation is migrating from an OpenCode-only composer to the
Agent-first backend architecture below.

Read [Desktop Agent Architecture](README.md) first for the process, IPC,
backend-adapter, event, security, and persistence boundaries.

The detailed normative contracts are [Cursor-style Chat UI behavior](chat-ui-behavior-spec.md)
and [Native Agent backend and model discovery](local-agent-connection-discovery.md).

The archived [Codex Implementation Brief](history/codex-vertical-slice.md)
records the original direct-runtime slice. The authoritative target decision is
[ADR-005](ADR-005-multi-native-agent-backends.md): PuppyOne presents one Chat
surface over multiple session-scoped native Agent backends. PuppyOne Agent uses
the managed OpenCode kernel; Codex, Claude Code and other supported products use
their own harness and native session.

## Status

- **Experimental, off by default:** Terminal remains available and is the
  default right-sidebar surface. The Settings → Experimental opt-in adds a
  separate Chat icon to the application header. A build-time availability flag
  remains an independent release kill switch for Chat only.
- **Implemented behind that gate:** the local-workspace right-side area is resizable, hosts separate
  Chat and Terminal panels, preserves Terminal's lazy PTY lifecycle,
  retains the selected surface, and keeps a running Agent turn alive while
  Chat is hidden.
- **Implemented foundation:** managed OpenCode/PuppyOne Agent path,
  connected-provider discovery, readiness/account/model/mode states, virtual transcript streaming, safe
  Markdown, part/tool registries, plan/tool/command/file activity, permission
  and structured-question docks, `/` commands, authorized `@` context and
  attachments, Stop, partial-history warning, and Jump to latest.
- **Implemented by capability:** history list/resume/fork/archive/delete,
  compaction, queue/steer controls, and model/mode selection. Unsupported
  controls are omitted.
- **Migration target:** restore a deliberate Agent selector, rename the current
  managed route to PuppyOne Agent, promote the native Codex adapter after its
  production gates, add Claude Code, and keep Cursor disabled until a supported
  protocol exists.
- **Product gate:** an Agent becomes selectable only after installation,
  version, authentication, protocol, model/tool, workspace and product-policy
  gates pass. Provider/Model controls are then scoped to that Agent.

## Product decision

Chat and Terminal are selected from two independent application-header icons.
They share the right-side layout area and width preference but remain separate
panel components. The sidebar itself contains no Chat/Terminal selector.

```text
+------------------------------------------------------+
| +--------------------------------------------------+ |
| | Explain the failing test and fix it.             | |
| +--------------------------------------------------+ |
|                                                      |
| I found the failure in workspaceOpening.ts.          |
|                                                      |
| Worked for 2s                                       |
| Read src/lib/workspaceOpening.ts                     |
| Ran npm test                                         |
|                                                      |
| Approval required                                   |
| npm install package-name                            |
|                                  Deny  Allow once   |
|                                                      |
| [ Changes +86 -12 ]                                  |
| (+)  Send follow-up       Agent / Model        Send  |
+------------------------------------------------------+
```

This is the visual hierarchy summary. Exact message, activity, animation,
composer and motion rules are defined in
[Cursor-style Chat UI behavior](chat-ui-behavior-spec.md). The sidebar remains
resizable through 760 px and does not introduce horizontal scrolling for
ordinary messages or controls.

## Surface hierarchy

The Chat surface has four primary regions in document order:

1. **Transcript** — user messages, assistant output, and activity items.
2. **Blocking dock** — an approval or structured question when one is pending.
3. **Changes handoff** — aggregate additions/deletions linking to the existing Git surface.
4. **Composer** — prompt, Agent → backend-scoped routing, the `+` tools/mode
   menu, submit, and stop/queue state.

Session history/new/overflow actions remain real controls but live in an
out-of-flow chrome cluster revealed by hover or keyboard focus; they do not
consume the reference transcript's top row. Only the transcript is the primary
scroll region. The blocking dock, Changes handoff and composer remain visible
without using `position: fixed`.

## Chat and Terminal header actions

- Terminal is not gated by the Agent experiment and remains the default
  surface until the user explicitly selects Chat.
- Chat and Terminal use two distinct icon buttons in the application header.
- Each button opens or closes its corresponding panel in the shared right-side
  layout area.
- Switching header buttons does not destroy the hidden panel's active session.
- The Terminal keeps its existing lazy first mount and PTY lifecycle.
- Hiding Chat keeps the mounted projection subscribed; `AgentService` remains
  the owner of active work in the main process and replay repairs any missed
  sequence after a renderer gap.
- Returning to Chat replays events after the renderer's last committed sequence
  or restores from the latest projection checkpoint.
- Closing the entire workspace window cleans up both terminal and agent
  resources through their respective main-process services.
- “Reset Terminal” and “New Agent Session” remain separate actions.

The Terminal icon remains a Terminal-only visibility toggle. Clear and Reset
live in the Terminal surface header. The Chat icon does not appear unless the
experiment is enabled. Chat session actions stay in the Chat panel header.

## Application header

The application header contains:

- the existing Terminal icon, always governed by the normal Terminal setting;
- the experimental Chat icon, visible only when the Agent Chat experiment is
  enabled;
- independent pressed/open state and accessible labels for each icon.

The Chat panel keeps New Session, history and diagnostics as on-demand chrome
rather than a persistent visual header. Controls use native buttons and menus,
become visible on keyboard focus, and expose meaningful accessible names.

## Agent and backend-scoped controls

The composer shows Agent first. Model, Provider, Variant, effort and mode
controls appear only when the selected Agent advertises them. These controls
use accessible PuppyOne popovers/listboxes because rows require grouping,
readiness, search, keyboard navigation and recovery actions.

```text
Agent
  PuppyOne Agent
  Codex
  Claude Code
  Cursor Agent          disabled with reason until protocol-ready
  OpenCode
      |
      v
backend-scoped controls
  PuppyOne Agent  -> Provider -> Model -> Variant -> Agent/Mode
  Codex           -> Model -> Reasoning -> Sandbox/Approval profile
  Claude Code     -> Model -> Effort -> Permission mode
  OpenCode        -> Provider -> Model -> Agent/Mode
```

The selected Agent controls which native harness and session will be created.
It is editable on a blank composer. Once a session exists, the Agent identity
is pinned and the control becomes a truthful session label; choosing another
Agent starts a new session rather than mutating or nesting native state.

| Discovery observation | Product meaning |
| --- | --- |
| PuppyOne Agent engine verified and provider/model connected | PuppyOne Agent is selectable. |
| Codex CLI passes version, account, app-server and model/tool gates | Codex is selectable and uses its native thread. |
| Claude Code passes SDK runtime, API/cloud credential and capability gates | Claude Code is selectable and uses its native session. |
| Cursor Agent is installed but has no supported protocol | Show Detected with a disabled explanation; never fake support through shell output. |
| User OpenCode passes its independent profile and protocol gates | OpenCode is selectable without using the PuppyOne Agent profile. |

Executable presence alone never enables Send. Detailed candidate paths,
probes, state fields, security boundaries and acceptance fixtures are defined
in [Native Agent backend and model discovery](local-agent-connection-discovery.md).

Authentication can expire after discovery. An authoritative rejection
quarantines the affected backend or backend-scoped Provider for the current
inspection, clears incompatible selections, retains the native session and
offers the native recovery action. It does not disable or select another Agent.

Changing Model, Variant or Mode follows backend capability:

- a supported per-turn override applies to the next turn;
- a new-session-only setting explains that boundary before creating a session;
- an unsupported control is omitted;
- a backend change always creates or selects another product session.

| State | Sidebar behavior |
| --- | --- |
| PuppyOne Agent engine missing/invalid | Disable PuppyOne Agent and offer application repair; keep healthy native Agents available. |
| Native Agent missing/incompatible | Show installation/version guidance for that Agent only. |
| Native Agent signed out | Offer its documented login action, never request or copy raw credentials. |
| Agent and backend-scoped model ready | Enable session creation and Send. |
| Active backend/provider error | Preserve native session and file changes; show scoped recovery without fallback. |

## Transcript

The transcript is a projection of normalized `AgentEvent` values. It renders
semantic items instead of provider protocol objects.

### User and assistant messages

- User messages preserve text and attachment references submitted in that turn.
- Assistant text streams into one active message region and remains selectable.
- Delta coalescing may reduce render frequency but cannot reorder text around
  tool, approval, question, or terminal events.
- Partial output remains visible after interruption or failure and is labeled
  with the terminal turn state.
- Raw hidden reasoning is not displayed. Provider-supported reasoning summaries
  may appear in a clearly labeled, collapsible summary item.

### Activity items

Tool and system activity uses compact rows or expandable cards:

```text
Plan updated
Read src/App.tsx
Searched for RightTerminalPanel
Ran npm test
Edited 2 files
Called MCP tool linear.get_issue
```

Every row has a stable status: pending, running, completed, failed,
interrupted, or waiting for input. Running state is not communicated by motion
alone.

Expanded details are intentionally bounded:

- commands show argv/command text, working directory, exit state, and a
  truncated output preview;
- file edits show paths and compact addition/deletion counts, then link to the
  existing Review or file preview surface;
- searches and reads show query/path plus a compact result summary;
- MCP and backend-native tools show a human label and redacted
  structured arguments;
- large results never render an unbounded preformatted block in the sidebar.

The Git and editor subsystems remain the source of truth for full diffs and
files. Chat activity links into those surfaces instead of duplicating their
editing behavior.

## Plans

When the selected backend exposes plan updates, the sidebar renders one current
plan item rather than appending a new card for every update.

The plan shows ordered steps and one of pending, in progress, or completed.
Backend-specific statuses map to this small vocabulary. Unknown
statuses remain visible as text but do not invent completion.

An Agent mode and a backend-generated plan are different:

- **Agent mode** is a backend-scoped operating constraint selected before a turn.
- **Plan item** is progress content emitted during any compatible turn.

The UI must not imply that showing a plan changes the native session's
permission or write policy.

## Approval dock

An unresolved approval occupies a dock between the transcript and composer.
The composer remains visible but cannot submit a conflicting new turn unless
the selected backend explicitly supports steering while blocked.

The dock shows:

- requested tool or action;
- command, path, domain, or other material scope;
- backend/tool explanation or risk context when available;
- Deny and Allow Once;
- Always Allow only when the backend supplies an explainable durable rule;
- expiration, cancellation, or stale-request state.

For network approvals, the target host and protocol are mandatory UI; for file
approvals, the authorized root is shown when present. Backend resolved-request
events remove stale docks without waiting for a Renderer action.

The focused action defaults to the safest choice. Keyboard order follows visual
order. Escape does not silently approve; it either leaves the request open or
denies only after an explicit product decision and accessible announcement.

Only one blocking dock is shown at a time. Additional backend requests queue
in main-process order and the transcript indicates the count. PuppyOne does not
resolve or merge independent approvals automatically.

## Structured-question dock

Backend-native questions use a distinct dock with:

- one to three concise questions;
- mutually exclusive or multi-select options as declared by the provider;
- free-form input when supported;
- Submit and Cancel/Reject actions with provider-accurate semantics.

Answers are sent with session, turn, and request correlation IDs. Dismissing the
sidebar does not fabricate an answer.

## Composer

The composer supports:

- a compact 64 px resting state with a text region above/alongside a stable
  action row, growing to a maximum 184 px before internal scrolling;
- multiline text with IME-safe Enter/Shift+Enter behavior;
- submit with the product's established keyboard convention;
- a single `+` menu for optional authorized attachments, workspace context and Agent mode;
- the selected Agent followed by its backend-scoped controls;
- an Agent-aware placeholder and readiness state;
- Stop while a turn is running;
- queue or steer only when the backend capability advertises it;
- retry as a new turn after a deterministic failure.

Prompt drafts are scoped by workspace and application session. Switching to
Terminal does not discard a draft. Starting a new session can offer to carry the
draft forward, but never copies prior provider history implicitly.

Attachment paths are resolved in the main process. Drag-and-drop data from the
renderer is treated as untrusted input and must pass the same workspace and file
capability checks as existing file operations.

## Session history

Session history is accessed from the header overflow menu or a compact picker,
not as a permanently visible third column inside the right sidebar.

Each entry contains:

- title;
- Agent backend and optional backend-scoped model;
- workspace identity;
- last activity time;
- last terminal state;
- partial-history indication when PuppyOne cannot reconstruct all prior items.

Opening history never resumes an active native turn accidentally. Deleting a
PuppyOne session mapping and deleting backend-native history are separate
operations unless that backend exposes deletion and the user explicitly
selects both.

## Empty, loading, and error states

The sidebar uses distinct states:

- discovering Agent backends;
- no compatible Agent installed;
- selected Agent setup required;
- PuppyOne Agent repair required while other Agents remain available;
- ready with no active session;
- restoring a session;
- active idle session;
- running turn;
- waiting for approval/question;
- interrupted turn;
- recoverable backend/provider/model error;
- native Agent process exited;
- partial history restored.

Loading retains the previous committed transcript when safe. A temporary model
or account refresh does not blank the entire sidebar.

Errors state which Agent failed and what remains valid. A backend failure can
leave file changes on disk; the sidebar must not imply that interrupting,
switching Agent or retrying automatically reverted them.

## Resize and scroll behavior

- The existing 420px minimum and 760px maximum remain the first implementation
  bounds.
- Header controls wrap or collapse into the overflow menu before transcript
  content becomes horizontally scrollable.
- Transcript rows use breakable paths and commands with expandable full text.
- The composer grows vertically to a bounded maximum, then scrolls internally.
- Opening or closing a dock preserves the user's transcript position when they
  are reading history.
- When pinned to the bottom, new deltas keep the transcript pinned.
- When scrolled away from the bottom, new deltas do not steal position; a
  “Jump to latest” action appears.
- Switching the Chat and Terminal header buttons preserves independent scroll
  positions.

## Focus and accessibility

- Opening Chat moves focus to the composer only when the user explicitly opens
  the sidebar for composing; restoring app focus does not always steal focus
  from the editor.
- Streaming updates use a restrained live-region strategy. Text deltas are not
  announced token by token.
- Turn completion, failure, interruption, and new blocking requests receive
  concise announcements.
- Tool rows are real buttons when expandable and expose expanded state.
- Status is always represented with text in addition to icon/color/motion.
- All actions are reachable without pointer input at every supported width.
- Reduced-motion preference applies to streaming indicators and sidebar
  transitions without disabling state communication.

## State ownership

Renderer state is divided deliberately:

```text
Persisted presentation preference
  sidebar open
  sidebar width
  last selected surface
  preferred Agent and backend-scoped controls for blank sessions

Workspace + session projection
  active application session id
  immutable Agent backend id
  transcript projection
  last committed event sequence
  draft and attachment references
  independent Chat scroll position

Main-process runtime state
  selected native Agent process/connection
  backend-native session id
  backend-scoped provider/model/variant/mode
  active turn
  pending approval/question
  authoritative event ordering
```

React component unmount is never the authoritative signal that a native turn
ended. The main process owns that lifecycle.

## Implemented component map

```text
src/features/desktop-agent/
  index.ts                         public feature entrypoint
  application/                    controller, event sync, UI-state cache
  domain/                         contract alias, projection, rows and readers
  ui/                             all React views and isolated CSS
  agentProjection.ts              migration-only re-export
  agentTypes.ts                   migration-only re-export
```

`RightAgentPanel` composes these units but does not implement backend mappings.
Native-to-event mapping belongs in Electron main-process adapters, and pure
event-to-view projection belongs in `domain/agent-projection.ts`.

## Acceptance criteria

The implemented sidebar contract remains satisfied when:

- the independent Chat and Terminal header buttons switch panels without losing
  their active state;
- a hidden running agent continues safely and reports completion on return;
- a blank composer exposes Agent before backend-scoped Model controls;
- a created session pins one Agent backend and switching Agent creates a new
  session rather than nesting or mutating native state;
- PuppyOne Agent, Codex and Claude Code can fail independently without silent
  fallback or global Chat disablement;
- image-only, audio-only, Embedding, deprecated, and non-tool Agent models are
  absent when the selected backend requires text-and-tools capability;
- streamed text, tools, plans, diffs, approvals, and questions preserve event
  order;
- full diffs and files open in their existing owning surfaces;
- no backend credential or arbitrary process API crosses into the renderer;
- stop, reset, hide, window close, native process exit, provider failure, and
  app quit have distinct, tested outcomes;
- the entire experience is keyboard accessible from 420px through 760px;
- Terminal behavior and its current tests remain unchanged.
