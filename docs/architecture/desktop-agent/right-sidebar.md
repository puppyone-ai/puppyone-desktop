# Right Sidebar Agent Chat

This document defines the target product, layout, lifecycle, and accessibility
contract for Agent Chat in PuppyOne Desktop's resizable right sidebar. The
backend uses the Agent-first native-harness architecture below; presentation
can evolve independently through the shared contract.

Read [Desktop Agent Architecture](README.md) first for the process, IPC,
backend-adapter, event, security, and cache-ownership boundaries.

The detailed normative contracts are [Cursor-style Chat UI behavior](chat-ui-behavior-spec.md)
and [Native Agent backend and model discovery](local-agent-connection-discovery.md).
[Agent Composer reference ingestion](composer-reference-ingestion.md) is the
normative contract for Explorer/Finder/paste acquisition, external staging,
runtime input capabilities and committed reference displays.

The archived [Codex Implementation Brief](history/codex-vertical-slice.md)
records the original direct-runtime slice. The authoritative target decision is
[ADR-005](ADR-005-multi-native-agent-backends.md) and
[ADR-006](ADR-006-native-harness-adapters-and-acp.md): PuppyOne presents one Chat
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
  Chat is hidden. The experimental Chat feature is a lazy renderer chunk and
  does not inflate the default desktop entry bundle when the gate is off.
- **Implemented runtime foundation:** PuppyOne Agent, Codex, Claude Code and user
  OpenCode native routes,
  connected-provider discovery, readiness/account/model/mode states, virtual transcript streaming, safe
  Markdown, part/tool registries, plan/tool/command/file activity, permission
  and structured-question docks, `/` commands, Stop, live-gap warning, and
  Jump to latest. Reference arrays/chips and workspace-only turn-start
  authorization exist as partial infrastructure.
- **Reference-ingestion gap:** the current Composer has no add/drop/paste/file
  picker entry, Explorer outbound drag is coupled to move, external files have
  no staged-token path, Codex reports references unsupported, and committed
  user messages do not preserve reference displays. The target contract below
  is pending `ISSUE-404`, not an implemented claim.
- **Implemented by capability:** native interruption, approvals/questions,
  compaction, queue/steer controls, and model/mode selection. PuppyOne does not
  expose or persist Chat History; unsupported controls are omitted.
- **Current boundary:** keep Cursor execution-disabled until a supported
  protocol and approval contract exist.
- **Product gate:** a registered Agent row is selectable as an inspection scope.
  Send becomes enabled only after installation, version, authentication,
  protocol, model/tool, workspace and product-policy gates pass. Provider/Model
  controls are scoped to that Agent.

## Product decision

Chat and Terminal are selected from two independent application-header icons.
They share the right-side layout area and width preference but remain separate
panel components. The sidebar itself contains no Chat/Terminal selector.

```text
+------------------------------------------------------+
| Codex v   +  ...                                  |
|       scroll-aware surface fade, no divider          |
| +--------------------------------------------------+ |
| | Explain the failing test and fix it.             | |
| +--------------------------------------------------+ |
|                                                      |
| I found the failure in workspaceOpening.ts.          |
|                                                      |
| Read   src/lib/workspaceOpening.ts                   |
| Bash   npm test                                      |
|                                                      |
| Approval required                                   |
| npm install package-name                            |
|                                  Deny  Allow once   |
|                                                      |
| [ Changes +86 -12 ]       floating, no layout row    |
| +--------------------------------------------------+ |
| | Send follow-up                                   | |
| | Model                                     Send   | |
| +--------------------------------------------------+ |
+------------------------------------------------------+
```

This is the visual hierarchy summary. Exact message, activity, animation,
composer and motion rules are defined in
[Cursor-style Chat UI behavior](chat-ui-behavior-spec.md). The sidebar remains
resizable through 760 px and does not introduce horizontal scrolling for
ordinary messages or controls.

## Surface hierarchy

The Chat surface has four primary regions in document order:

1. **Session sub-header** — one left-aligned cluster containing persistent Agent identity,
   New Session and overflow actions; the right edge stays intentionally quiet.
2. **Transcript** — user messages, assistant output, and activity items.
3. **Blocking dock** — an approval or structured question when one is pending.
4. **Composer** — prompt, backend-scoped Model/configuration, submit, and stop/queue state.

**Changes handoff** is a Composer-anchored floating accessory, not a fifth layout
row. It sits eight pixels above the Composer without intersecting its surface and never
increases dock height. Blocking approval/question docks take visual priority and
temporarily suppress this accessory.

New-session and overflow actions remain real flat controls directly beside the Agent identity in
the in-flow sub-header; there is no enclosing action pill and no PuppyOne History control. Only the
current live transcript is the primary scroll region. The blocking dock and
Composer remain in flow; the Changes handoff uses absolute positioning only
inside the Composer's local containing block.

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
  from the current main-process connection or its bounded in-memory checkpoint.
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

The Chat panel keeps Provider identity, New Session and diagnostics together at the left edge of a
46 px sub-header whose
geometry follows the left-sidebar top navigation: 12 px top/inline padding, 4 px bottom padding,
30 px controls and 4 px gaps, all through the shared navigation tokens. Its edge uses the same Data-sidebar contract: no visible
divider or resting drop shadow, followed by an 18 px same-surface fade that appears only while the
transcript has scrolled beneath it. It has no underline, surrounding pill, PuppyOne History,
archive, fork or delete-history menu. Controls use native buttons and menus and expose meaningful
accessible names.

## Agent and backend-scoped controls

The top-left sub-header shows the selected Agent/Provider first, immediately followed by the flat
New Session and overflow actions, and keeps that session identity visible while the transcript
scrolls. The far right of this sub-header is empty. Model, inference Provider, Variant, effort and mode
controls remain in the composer only when the selected Agent advertises them. These controls use
accessible PuppyOne popovers/listboxes with one flat Agent list, bounded model search, keyboard
navigation and compact readiness warnings.

```text
Agent
  PuppyOne Agent
  Codex
  Claude Code
  Cursor Agent          selectable row; warning until protocol-ready
  OpenCode
      |
      v
backend-scoped controls
  PuppyOne Agent  -> Provider -> Model -> Variant -> Agent/Mode
  Codex           -> Model -> Reasoning -> Sandbox/Approval profile
  Claude Code     -> Model -> Effort -> Permission mode
  OpenCode        -> Provider -> Model -> Agent/Mode
```

The selected Agent controls which native harness and live connection will be created. Its
prominent sub-header placement communicates that it is a session boundary rather than a model
parameter. Choosing another Agent while idle closes the current PuppyOne bridge connection,
clears the current live projection and starts a new one rather than mutating or nesting native
state. The native product remains the sole owner of any native conversation history; PuppyOne
does not offer the discarded projection as Chat History.

| Discovery observation | Product meaning |
| --- | --- |
| PuppyOne Agent engine verified and provider/model connected | PuppyOne Agent is selectable. |
| Codex CLI passes version, account, app-server and model/tool gates | Codex is selectable and uses its native thread. |
| Claude Code passes SDK runtime, API/cloud credential and capability gates | Claude Code is selectable and uses its native session. |
| Cursor Agent is installed but has no supported protocol | Allow scoped selection, show one warning icon and keep Send disabled; never fake support through shell output. |
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
- a backend change always creates another live bridge connection.

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

Tool and system activity uses one borderless compact-row grammar with optional inline
disclosure details:

```text
Plan    updated
Read    src/App.tsx
Grep    RightTerminalPanel
Bash    npm test
Edit    2 files
Linear  get_issue
```

The icon and tool identity are the only accented elements; their one-line command/path
summary is muted. Resting rows have no outer border or card background. Successful exit,
duration and provenance metadata, plus repeated `Open terminal`, `Open file` and `Review`
actions, are omitted from the collapsed row. Every row still has a stable pending, running,
completed, failed, interrupted, or waiting-for-input state. Running state is not communicated
by motion alone.

An expandable row places its chevron directly after the tool name and before the muted
summary. Conversation rows expose no generic Copy toolbar. User-to-Agent and Agent-to-user
turn transitions use a shared 24 px gap; Agent text hands off to its first tool with 8 px.
Every completed, failed or interrupted turn ends in one muted `Worked for <duration>` timeline
summary. Timing is normalized at the lifecycle boundary (native provider timing first, common
live-turn clock as fallback), so all harness routes share the same UI contract without the
Renderer owning an Agent loop or fabricating duration.
User text, Agent prose, working state and turn summary share one 12 px content rail. The summary
is left-aligned, uses the normal Agent body size and has no decorative divider lines; only its
muted theme color distinguishes metadata from the response.
Message/summary leaf components own that rail. Virtual timeline rows own only ordering,
measurement and vertical spacing, and narrow container rules cannot redefine one role's inset.
Static visual declarations stay in Agent CSS. Runtime measurement code may publish only typed
`--agent-*` geometry values; CSS remains the sole owner of height, transforms, positioning,
visibility, spacing, typography and color. Agent TSX neither writes `element.style` nor carries
literal style objects. The Composer relies on native CSS content sizing rather than a React
`scrollHeight`/`ResizeObserver` loop; only virtual-list and anchored-overlay geometry cross the
typed custom-property bridge.

Expanded details are intentionally bounded:

- commands show exact argv/command text and a truncated output preview under a quiet branch rail;
- file edits show paths and compact addition/deletion counts; paths link to the file preview and
  the single Composer-level Changes handoff owns review;
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

Prompt drafts are scoped to the current workspace and running Renderer process.
Switching to Terminal does not discard a draft. Starting a new live connection
never copies prior provider history implicitly.

The whole Chat surface is a hit target for recognized file/reference drags. A
valid drag presents a non-layout-changing overlay and Composer highlight;
dropping adds pending chips but never sends, moves an Explorer node, imports a
file or changes the workspace. The `+` menu is the keyboard-accessible
equivalent and remains the primary discoverable entry.

| Source | Composer result |
| --- | --- |
| Explorer file | live workspace-file context |
| Explorer directory | live directory scope; never a recursive upload |
| Finder/file picker/pasted image | main-owned immutable staged attachment |
| validated workspace-relative path text | workspace context |
| absolute path, `file://` or other plain text | ordinary text; no access grant |

Workspace context and external attachments use different security semantics.
Main canonicalizes a workspace entry again when the turn starts. A real
operating-system `File` is resolved in preload, copied once into a
permission-restricted main-owned staging area and represented in Renderer state
only by an owner/workspace-bound opaque token plus bounded metadata. Raw
external path strings never grant access, and external files are not silently
copied into the workspace.

Prompt, model/mode and ready references are captured atomically as one
submission intent. Queue stores complete intents rather than strings; steer may
carry references only when the native method advertises that exact capability.
Turn-start failure preserves the intent without overwriting a newer draft, and
native acceptance transfers sanitized reference displays into the committed
user message. Full data model, cleanup and adapter rules are defined in
[Agent Composer reference ingestion](composer-reference-ingestion.md).

## History and cache boundary

PuppyOne is a unified Agent UI and connection boundary, not a Chat History
database. It does not persist, list, archive, fork, rename or delete prior
conversations. If Codex, Claude Code, OpenCode or another native product keeps
history, that history remains entirely under that product's storage and policy.

```text
PERSISTED BY PUPPYONE                  NOT PERSISTED BY PUPPYONE
-----------------------------------    ----------------------------------
last selected Agent/backend id         prompts, answers and tool output
valid backend-scoped model preference  transcript rows and titles
sanitized local-Agent detection DTO    native thread/session ids
cache schema version + timestamp       history/archive/fork metadata

CURRENT PROCESS ONLY                   PROVIDER OWNED
-----------------------------------    ----------------------------------
active bridge/session correlation      native conversation history
bounded live event replay ring         native resume/fork/compaction state
current draft and scroll position      provider retention/deletion policy
```

The selected Agent preference contains only a validated runtime ID. The local
detection cache contains only the Renderer-safe public DTO: no executable path,
environment, token, credential location or raw probe output. A cached detection
result is presentation data, never execution authority; main revalidates the
selected runtime before starting native work.

## Empty, loading, and error states

The sidebar uses distinct states:

- discovering Agent backends;
- no compatible Agent installed;
- selected Agent setup required;
- PuppyOne Agent repair required while other Agents remain available;
- ready with no active session;
- reconnecting to a current process-local connection;
- active idle session;
- running turn;
- waiting for approval/question;
- interrupted turn;
- recoverable backend/provider/model error;
- native Agent process exited;
- an incomplete current live-event window after a sequence gap.

Loading retains the previous committed transcript when safe. A temporary model
or account refresh does not blank the entire sidebar.

Cold start has one visual owner: the conversation viewport renders the shared
product `PageLoading` animation at its center, without a visible label. Header
and status regions must not add a second spinner, progress card or competing
"checking / restoring / starting" message. The loader still exposes a concise
accessible status label. The dock and Composer are absent while this cold-start
loader is visible. Once committed transcript content exists, background
discovery or restoration keeps that content visible instead of covering it with
the cold-start loader. Recovery cards are reserved for actionable unavailable,
failed or error states.

After discovery/restoration, a routable active panel begins one background
native-session preparation. The controller owns this as a single-flight promise:
the panel effect, React remounts and the first Submit all reuse the same work.
Provider/model switching and New Session are disabled while it is in flight,
but the Composer stays available so the user can write and submit immediately.
Closing a stale renderer never publishes its late snapshot; any native session
that resolves afterward is closed with persistence removal on a best-effort basis.

```text
application startup       PageLoading; Composer absent
route ready               background session preparation; no transcript row
Submit during preparation Preparing <Agent>
session prepared          Starting turn
native turn.started       Thinking
first native output       assistant/tool/reasoning renderer
```

The ready/no-session transcript is deliberately blank. It has no centered prompt,
logo tile, title, supporting paragraph, card or decorative surface. The Composer
is the only invitation to act, and its ready/empty textarea uses the quiet
`Ask about this project` placeholder plus an accessible name.

The Agent sidebar keeps a 12 px outer inset at every supported width. Its Composer,
picker rows and compact interactive rows mirror the existing Data tree's 6 px radius
and quiet white row-state surfaces. This mapping is intentionally one-way and scoped
to the Agent boundary: the Data sidebar's implementation and color values are not
overridden by Agent Chat.

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
  are reading earlier output in the current live transcript.
- When pinned to the bottom, new deltas keep the transcript pinned.
- When scrolled away from the bottom, new deltas do not steal position; a
  30 px circular, icon-only “Jump to latest” control floats at the lower center
  of the transcript without occupying a row. Unread detail remains in its
  accessible name rather than becoming another visible badge.
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
  last selected Agent/backend id
  valid backend-scoped model preference

Persisted sanitized discovery cache
  public local-Agent status DTO only
  schema version + scan timestamp + 24-hour maximum age
  explicit Refresh bypasses and replaces the cache

Current-process presentation state only
  active application session id
  immutable Agent backend id
  transcript projection
  last committed event sequence
  draft references and immutable submission intents
  independent Chat scroll position

Main-process runtime state
  selected native Agent process/connection
  backend-native session id
  backend-scoped provider/model/variant/mode
  active turn
  pending approval/question
  short-lived staged-attachment token registry and leases
  authoritative event ordering

Provider-owned durable state
  native thread/session and any provider history
  provider compaction, fork, retention and deletion semantics
```

React component unmount is never the authoritative signal that a native turn
ended. The main process owns that live lifecycle, but no PuppyOne transcript or
native session mapping survives application shutdown.

## Implemented component map

```text
src/features/desktop-agent/
  index.ts                         public feature entrypoint
  lazy.ts                          public code-split Chat entrypoint
  application/                    controller, single-flight session prep, event sync, UI-state cache
  domain/                         contract alias, projection, rows and readers
  ui/                             React views, preparation hook and isolated CSS
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
- reopening Chat selects the last valid Agent preference without interpreting
  it as a saved conversation;
- opening a routable Chat starts at most one background native-session preparation,
  and a simultaneous first Submit reuses it;
- `Thinking` appears only after the selected harness emits `turn.started`;
- a fresh, schema-valid local-Agent detection cache avoids another CLI scan;
  explicit Refresh, expiry, corruption or schema mismatch performs a new scan;
- PuppyOne exposes no Chat History list and writes no transcript/session journal;
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
