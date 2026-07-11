# Right Sidebar Agent Chat

This document defines the implemented product, layout, lifecycle, and
accessibility contract for Agent Chat in PuppyOne Desktop's resizable right
sidebar.

Read [Desktop Agent Architecture](README.md) first for the process, IPC,
provider-adapter, event, security, and persistence boundaries.

The older [Codex Implementation Brief](implementation-brief.md) records the
original direct-runtime slice. The current runtime architecture is in the main
README and OpenCode ADR.

## Status

- **Experimental, off by default:** Terminal remains available and is the
  default right-sidebar surface. The Settings → Experimental opt-in adds a
  separate Chat icon to the application header. A build-time availability flag
  remains an independent release kill switch for Chat only.
- **Implemented behind that gate:** the local-workspace right-side area is resizable, hosts separate
  Chat and Terminal panels, preserves Terminal's lazy PTY lifecycle,
  retains the selected surface, and keeps a running Agent turn alive while
  Chat is hidden.
- **Implemented:** OpenCode Harness and Codex direct-runtime selection,
  readiness/account/model/mode states, virtual transcript streaming, safe
  Markdown, part/tool registries, plan/tool/command/file activity, permission
  and structured-question docks, `/` commands, authorized `@` context and
  attachments, Stop, partial-history warning, and Jump to latest.
- **Implemented by capability:** history list/resume/fork/archive/delete,
  compaction, queue/steer controls, and runtime/model/mode selection. Unsupported
  controls are omitted.
- **Product gate:** provider options appear only when their adapter and allowed
  authentication mode are available.

## Product decision

Chat and Terminal are selected from two independent application-header icons.
They share the right-side layout area and width preference but remain separate
panel components. The sidebar itself contains no Chat/Terminal selector.

```text
+------------------------------------------------------+
| Session title                         History  More   |
|------------------------------------------------------|
| User                                                 |
| Explain the failing test and fix it.                 |
|                                                      |
| Agent                                                |
| I found the failure in workspaceOpening.ts.          |
|                                                      |
| > Plan updated                              2 / 3    |
| > Read src/lib/workspaceOpening.ts               ✓   |
| > Run npm test                                   ✓   |
| > Edited 1 file                         View changes  |
|                                                      |
|------------------------------------------------------|
| Approval required                                   |
| npm install package-name                            |
|                                  Deny  Allow once   |
|------------------------------------------------------|
| Plan, build, / commands, @ context            Stop   |
| Harness   Mode   Provider / Model   Attach           |
+------------------------------------------------------+
```

This is a conceptual hierarchy, not pixel-level visual design. The existing
sidebar width remains 420px to 760px. Content reflows within that range and does
not introduce horizontal scrolling for ordinary messages or controls.

## Surface hierarchy

The Chat surface has four primary regions in document order:

1. **Session header** — session title and actions.
2. **Transcript** — user messages, assistant output, and activity items.
3. **Blocking dock** — an approval or structured question when one is pending.
4. **Composer** — prompt, attachments, runtime/model/mode controls, submit, and stop/queue state.

Only the transcript is the primary scroll region. The header, blocking dock,
and composer remain visible without using `position: fixed`. The layout uses
the sidebar's existing flex boundary so it behaves correctly during animated
resize and window resizing.

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

The Terminal icon and its Clear/Reset menu remain Terminal-only. The Chat icon
does not appear unless the experiment is enabled. Chat session actions stay in
the Chat panel header rather than being added to Terminal's menu.

## Application header

The application header contains:

- the existing Terminal icon, always governed by the normal Terminal setting;
- the experimental Chat icon, visible only when the Agent Chat experiment is
  enabled;
- independent pressed/open state and accessible labels for each icon.

The Chat panel has its own session header with title, New Session, diagnostics,
reset, and close actions. Controls use native buttons and menus, preserve
keyboard focus styles, and expose meaningful accessible names.

## Runtime and model-provider controls

The compact composer footer contains only controls the active runtime supports:

- provider selector;
- model selector when model discovery is available;
- mode selector for supported modes such as Agent, Plan, or Ask;
- compact account/readiness status when action is required.

Changing runtime closes the current connection without deleting its history,
then restores or creates a session for the selected runtime. Native sessions
are never silently migrated between runtimes and remain available in History.

Changing model or mode follows provider capability:

- if the provider supports a per-turn override, the change applies to the next
  turn in the current session;
- if it requires a new session, the UI says so before applying it;
- if it is unsupported, the control is omitted rather than disabled without an
  explanation.

Readiness states have explicit recovery actions:

| State | Sidebar behavior |
| --- | --- |
| `not-installed` | Name the missing provider and offer Refresh after the user installs it externally. |
| `installed-not-authenticated` | Offer the provider-supported login or setup action when PuppyOne is allowed to host it. |
| `unsupported-version` | Show detected and minimum supported versions plus the provider's update command. |
| `ready` | Enable session creation and composer submission. |
| `error` | Show a concise reason and a provider diagnostics action without exposing secrets. |

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
- MCP and provider tools show a human label and redacted structured arguments;
- large results never render an unbounded preformatted block in the sidebar.

The Git and editor subsystems remain the source of truth for full diffs and
files. Chat activity links into those surfaces instead of duplicating their
editing behavior.

## Plans

When the provider exposes plan updates, the sidebar renders one current plan
item rather than appending a new card for every update.

The plan shows ordered steps and one of pending, in progress, or completed.
Provider-specific statuses map to this small vocabulary. Unknown statuses remain
visible as text but do not invent completion.

Plan mode and a runtime-generated plan are different:

- **Plan mode** is an operating constraint selected before a turn.
- **Plan item** is progress content emitted during any compatible turn.

The UI must not imply that showing a plan makes a provider read-only.

## Approval dock

An unresolved approval occupies a dock between the transcript and composer.
The composer remains visible but cannot submit a conflicting new turn unless
the provider explicitly supports steering while blocked.

The dock shows:

- requested tool or action;
- command, path, domain, or other material scope;
- provider explanation or risk context when available;
- Deny and Allow Once;
- Always Allow only when the provider supplies an explainable durable rule;
- expiration, cancellation, or stale-request state.

For Codex network approvals, the target host and protocol are mandatory UI;
for file approvals, `grantRoot` is shown when present. Provider
`serverRequest/resolved` notifications remove stale docks without waiting for a
renderer action.

The focused action defaults to the safest choice. Keyboard order follows visual
order. Escape does not silently approve; it either leaves the request open or
denies only after an explicit product decision and accessible announcement.

Only one blocking dock is shown at a time. Additional provider requests queue
in main-process order and the transcript indicates the count. PuppyOne does not
resolve or merge independent approvals automatically.

## Structured-question dock

Provider questions use a distinct dock with:

- one to three concise questions;
- mutually exclusive or multi-select options as declared by the provider;
- free-form input when supported;
- Submit and Cancel/Reject actions with provider-accurate semantics.

Answers are sent with session, turn, and request correlation IDs. Dismissing the
sidebar does not fabricate an answer.

## Composer

The composer supports:

- multiline text;
- submit with the product's established keyboard convention;
- optional local file/image attachments after workspace authorization;
- a provider-aware placeholder;
- Stop while a turn is running;
- queue or steer only when the provider capability advertises it;
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
- provider;
- workspace identity;
- last activity time;
- last terminal state;
- partial-history indication when PuppyOne cannot reconstruct all prior items.

Opening history never resumes an active provider turn accidentally. Deleting a
PuppyOne session mapping and deleting provider-native history are separate
operations unless the provider exposes deletion and the user explicitly
selects both.

## Empty, loading, and error states

The sidebar uses distinct states:

- discovering providers;
- no supported provider installed;
- provider setup required;
- ready with no active session;
- restoring a session;
- active idle session;
- running turn;
- waiting for approval/question;
- interrupted turn;
- recoverable provider disconnect;
- provider process exited;
- partial history restored.

Loading retains the previous committed transcript when safe. A temporary model
or account refresh does not blank the entire sidebar.

Errors state what failed and what remains valid. For example, a provider crash
can leave file changes on disk; the sidebar must not imply that interrupting or
retrying automatically reverted them.

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
  preferred provider/model/mode

Workspace + session projection
  active application session id
  transcript projection
  last committed event sequence
  draft and attachment references
  independent Chat scroll position

Main-process runtime state
  provider connection/process
  provider-native session id
  active turn
  pending approval/question
  authoritative event ordering
```

React component unmount is never the authoritative signal that a provider turn
ended. The main process owns that lifecycle.

## Proposed component map

```text
src/features/desktop-agent/
  RightAgentPanel.tsx
  AgentSurfaceHeader.tsx
  AgentControls.tsx
  AgentTranscript.tsx
  AgentMessage.tsx
  AgentActivityItem.tsx
  AgentPlanItem.tsx
  AgentApprovalDock.tsx
  AgentQuestionDock.tsx
  AgentComposer.tsx
  AgentSessionPicker.tsx
  agentProjection.ts
  agentTypes.ts
```

`RightAgentPanel` composes these units but does not implement provider mappings.
Provider-to-event mapping belongs in Electron main-process adapters, and pure
event-to-view projection belongs in `agentProjection.ts`.

## Acceptance criteria

The proposed sidebar contract is satisfied when:

- the independent Chat and Terminal header buttons switch panels without losing
  their active state;
- a hidden running agent continues safely and reports completion on return;
- provider selection is capability-driven and never migrates history silently;
- streamed text, tools, plans, diffs, approvals, and questions preserve event
  order;
- full diffs and files open in their existing owning surfaces;
- no provider credential or arbitrary process API crosses into the renderer;
- stop, reset, hide, window close, provider crash, and app quit have distinct,
  tested outcomes;
- the entire experience is keyboard accessible from 420px through 760px;
- Terminal behavior and its current tests remain unchanged.
