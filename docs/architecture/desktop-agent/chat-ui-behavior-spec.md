# Cursor-style Agent Chat UI behavior specification

Status: implemented Cursor-style conversation document, compact work evidence
and Agent-first selection contract. Multi-native backend capability differences
remain incremental work and must preserve the native harness boundaries in
ADR-005 and ADR-006.

This specification turns the visual direction in [Right Sidebar Agent Chat](right-sidebar.md)
into implementable rules. The pixel reference is the MIT-licensed frontend in
[`YishenTu/claudian@7d7cc84c`](https://github.com/YishenTu/claudian/tree/7d7cc84c60a77431aaccda7ff49a2f1f4ae1c2ab),
especially its message, tool-call, inline-diff, input and model-selector modules. PuppyOne owns
the React port, design-token mapping, accessibility improvements and security boundary. Claudian
provider/runtime/session code is not copied, but its native-backend separation is an architectural
reference for [ADR-005](ADR-005-multi-native-agent-backends.md).
The exact upstream-to-PuppyOne file map and MIT notice are in
[`vendor/claudian/SOURCE_ADOPTION.md`](../../../vendor/claudian/SOURCE_ADOPTION.md).
This file uses plain-text diagrams only.

## 1. Product contract

The sidebar should read like a conversation with compact evidence of work, not like a log
viewer or a stack of unrelated cards.

```text
Conversation layer       user prompts + assistant Markdown
Work layer               plan/read/search/bash/write/tool activity
Decision layer           permission/question/review actions
Control layer            context + Agent -> backend-scoped controls + send/stop
```

The following invariants are mandatory:

- user and assistant messages remain the primary visual hierarchy;
- tool activity is compact by default and expands in place;
- assistant Markdown never receives a generic card surface, border or shadow;
- read/search/reasoning/tool rows never share a decorative Research timeline
  rail; only semantically related command output forms one bounded card;
- repeated updates mutate one stable row instead of appending duplicates;
- proposed work, approved work and completed work are visibly different states;
- raw provider JSON, ANSI control sequences and hidden reasoning are never rendered directly;
- animation communicates state change but never delays input, approval or Stop;
- remounting the current live session does not replay entrance animations;
- reduced-motion mode preserves every state without translation, shimmer or pulse.

## 2. Surface anatomy

```text
+------------------------------------------------------+
| Codex v   +  ...                                  |
|       scroll-aware surface fade, no divider          |
|                                                      |
|                   +-------------------------------+  |
|                   | User prompt                   |  |
|                   +-------------------------------+  |
|                                                      |
| Assistant answer in document flow                    |
|                                                      |
| Read       4 files                                   |
| Bash       npm test                                  |
| Edit       3 files                                   |
|                                                      |
| [approval or question dock, only when blocking]      |
| [Changes +42 -11]         floating, no layout row    |
| +--------------------------------------------------+ |
| | Send follow-up                                   | |
| | GPT-5.x                                  send    | |
| +--------------------------------------------------+ |
+------------------------------------------------------+
```

Only the transcript scrolls. The decision dock and Composer stay anchored at the bottom in
normal document layout. Changes is a local floating accessory anchored to the Composer; it
must not create another grid row or increase dock height.

The top sub-header owns one left-aligned cluster: selected coding-Agent identity, New Session and
overflow. Its right edge remains empty so session chrome does not compete with the app-header
surface controls. It uses the same 46 px top-navigation
geometry, text scale and flat icon-button treatment as the left sidebar: 12 px top and inline
padding, 4 px inner/bottom padding, 30 px controls and a 4 px control gap. These values are consumed
through the shared sidebar-navigation tokens rather than duplicated Agent-only constants. Like the Data sidebar,
its toolbar edge is transparent at rest. Once the transcript scrolls underneath, the transcript
owns an 18 px same-surface fade whose opacity ramps over the first 24 px of scrolling. A visible
bottom border, drop shadow, underline and enclosing action pill are not allowed. Provider identity
is therefore visually persistent while Model remains a lower-level composer choice.

### 2.1 Shared typography contract

Agent Chat and the left sidebar share one Appearance-controlled type scale:

```text
Appearance: Small / Default / Large
                  |
                  v
        --po-text-size-sidebar     12 / 13 / 14 px
                  |
                  v
     --desktop-sidebar-font-size
             /             \
            v               v
   left sidebar rows   --agent-font-size
                         /   |    \
                        v    v     v
                 messages  input  tool rows/pickers
```

- Primary Chat text must use `--agent-font-size`, which aliases the same
  `--desktop-sidebar-font-size` consumed by left-sidebar rows. Default is 13 px;
  Small and Large are 12 px and 14 px. A Chat component must not hard-code its own
  13/14 px body size.
- Secondary timestamps, statuses and metadata use the shared meta scale. Headings keep
  semantic hierarchy through the responsive title tokens, and command/code surfaces keep
  the Appearance-controlled monospace code size.
- The app shell and the shared overlay root both redeclare the sidebar aliases at their
  theme boundary. This prevents portalled pickers from freezing at the default size and
  guarantees that an Appearance change updates the left and right sidebars together.

## 3. Shared row state model

Every activity renderer consumes the same presentation state instead of inventing its own
loading and error vocabulary.

The panel cold-start state is separate from activity rows. It has exactly one
visual owner: a centered instance of the shared product `PageLoading` component
inside the conversation viewport. It has no visible loading copy, does not
create a transcript/message row, and must not be duplicated in the header or
status region. Its accessible name identifies the Agent being prepared. When a
committed transcript is already present, discovery/restoration preserves the
transcript and omits the cold-start loader.

Application discovery/restoration and native-session preparation are different
states. Once routing is ready, the active Chat panel starts one background,
single-flight native-session preparation. That work does not create a transcript
row or hide the Composer. If the user submits before it finishes, Submit awaits
the same promise instead of starting a second Agent process or session.

```text
panel active + route ready
  -> background native-session preparation (no transcript status)

first Submit before preparation resolves
  -> optimistic User row
  -> Preparing <Agent>
  -> Starting turn
  <- native turn.started
  -> Thinking
  <- first reasoning summary / tool / assistant text
  -> native content renderer
```

`Thinking` is therefore evidence of an accepted, running native turn. It must
never be inferred from a pending local prompt, process startup, account/model
inspection, or native thread/session creation.

```text
queued -> running -> waiting-for-user -> succeeded
                  \-> failed
                  \-> cancelled
```

| State | Leading treatment | Trailing treatment | Motion |
| --- | --- | --- | --- |
| queued | neutral icon | `Queued` | none |
| running | accent icon | compact spinner or elapsed time | spinner only |
| waiting-for-user | warning icon | `Review` or `Approval required` | one entrance transition |
| succeeded | accent tool identity | none | none after settle |
| failed | error icon | `Failed` | one color transition, no shake |
| cancelled | muted icon | `Stopped` | none |

`runtimeId + nativeSessionId + turnId + itemId` is the stable identity. Delta, progress,
completion and retry events update that identity. Sorting by arrival time is not an acceptable
substitute for stable event correlation.

## 4. User messages

```text
+--------------------------------------------------------------------+
| Fix the sidebar scroll stall                                      |
| [@RightSidebar.tsx]                                                |
+--------------------------------------------------------------------+
```

### Layout

- Fill the transcript content width. The transcript owns the single 12 px outer inset on both
  sides, so the message row must not add another horizontal margin or narrower max-width.
- Reuse the resting Composer background exactly, with no border or shadow and the shared 6 px
  Sidebar row radius. The surface must read as quiet grouping, not as a raised card.
- Use 8 px vertical and 12 px horizontal content padding. Preserve user whitespace and wrap long
  paths, URLs and CJK text without horizontal scrolling. The optimistic live-tail row uses the
  same width and alignment as the committed virtualized row.
- Treat that 12 px inset as the shared conversation content rail: User text, Agent prose,
  `Thinking`, and terminal turn metadata all start on it. The User surface itself remains on the
  outer transcript rail; its internal padding must not leave Agent prose visually farther left.
- The leaf presentation component owns this inset (`AgentMessagePart`, working indicator, or turn
  summary), not the virtual-list row. Virtualization owns only measurement, ordering and vertical
  rhythm. Responsive styles may change available width but must not override the conversation
  content rail for an individual message kind.
- Static presentation declarations—including spacing, typography, color, height, transform,
  positioning and visibility—live in feature CSS. TypeScript may calculate only runtime geometry
  that cannot exist before measurement (virtual height/offset, scroll fade or anchored overlay
  coordinates), and exposes those values through the typed `--agent-*` custom-property bridge.
  TSX must not contain literal inline style objects, mutate `element.style`, or own visual
  fallbacks. Composer auto-growth uses CSS `field-sizing: content` with CSS-owned min/max height
  and overflow; it does not run a React measurement/resize loop.
- Render `@` context, attachments and quoted files as compact chips below the text inside the
  same row. Chips show a safe basename, never an unbounded absolute path.
- Conversation rows do not add a generic Copy toolbar. Text selection and platform copy remain
  native; editing a sent prompt is not implied, and a correction is a new follow-up turn.
- Every transition from a user row into Agent output, or from Agent output into the next user
  row, uses the shared 24 px turn gap. This is distinct from the compact 8 px Agent-text-to-tool
  handoff and the zero-gutter sequence between adjacent tools.

### Motion

- A newly submitted local prompt enters once with `opacity 0 -> 1` and `translateY(4px) -> 0`
  over 140 ms using the standard deceleration curve.
- Do not animate width, text, border radius or transcript height.
- A restored prompt appears immediately. An optimistic prompt that is rejected stays visible
  and gains an inline failure label; it must not disappear and reappear.

## 5. Assistant messages

Assistant output uses document flow with no surrounding bubble.

```text
I found the blocking work in the Markdown initialization path.

The parser and editor extensions are created synchronously before the
sidebar gets another frame, so wheel and pointer input wait behind it.
```

- Markdown occupies the available transcript width with a readable measure. Body text uses
  the shared sidebar/Agent size and a 1.55-1.7 line height.
- The assistant container is transparent and borderless. Theme tokens control text, inline
  code, links and code blocks; a generic raised-surface token must not wrap the whole answer.
- Assistant messages do not create a response-action header or hidden Copy row. Only a
  non-completed terminal state may occupy reserved trailing status space.
- Every terminal turn ends with one low-contrast `Worked for <duration>` summary. The duration
  comes from the normalized terminal event: provider-native timing wins, and the main-process
  lifecycle clock supplies the live fallback. The Renderer never invents elapsed time from a
  loading animation. The summary belongs to the turn timeline, follows its final message/tool,
  and precedes the shared 24 px gap into the next user turn.
- The duration summary is left-aligned on the shared content rail and uses the ordinary Agent
  body size and line height. It has no centering rails, divider lines, icon, badge or card; color
  is the only hierarchy reduction.
- User rows, assistant text, work evidence, context dividers and errors are five separate
  semantic treatments. Do not reuse one card component for all five.
- The first visible assistant content may fade in over 120 ms. Subsequent tokens do not use a
  per-character typewriter animation.
- Text deltas are coalesced into at most one visual commit per 24-50 ms; permission, question,
  tool-boundary and terminal events bypass the text batch so ordering stays correct.
- Submission is optimistic at the presentation boundary: the local prompt appears before
  native session/thread creation finishes. Session preparation is labeled `Preparing <Agent>`;
  the accepted RPC before its event is labeled `Starting turn`. Only after the authoritative
  native `turn.started` event and before the first reasoning, tool or text part may one quiet
  `Thinking` row occupy the live tail. All three labels are presentation-only and never journaled.
- A native reasoning-summary section boundary may replace the generic `Thinking` row before
  summary text arrives. Raw reasoning deltas are not rendered. After a completed tool, the
  generic working pulse may reappear while the same native turn remains active.
- A streaming caret is optional and may only appear at the final text edge while a text part
  is active. It disappears immediately on tool transition, Stop, failure or completion.
- Headings, lists, links, tables, inline code and fenced code use PuppyOne Markdown policies.
  Links use the safe external-navigation path and raw HTML is not executed.
- Code blocks have a language label and Copy action. Long blocks use internal overflow and a
  height cap; they do not widen the sidebar.
- Projection bounds every user/assistant message to 128 KiB. Initial Markdown mounts at most
  24 KiB and 240 blocks; a truthful `Show full response` disclosure retains access to the full
  bounded response. The initial window preserves both the beginning and latest tail so long
  streaming output cannot create a main-thread Long Task merely by becoming visible.
- Generic message action chrome is omitted. Text selection and platform copy remain native;
  code blocks retain their scoped Copy action.
- Raw chain-of-thought is never shown. A provider-supplied reasoning summary is a separately
  labeled, collapsed part.

## 6. Plan rendering

Plans are one mutable block per turn, not one card per update.

```text
Plan
  [done] Inspect provider discovery
  [work] Add Agent -> Provider -> Model routing
  [next] Verify renderer and main-process guards
```

- Keep item order stable unless the Agent explicitly replaces the plan.
- Use completed, active and pending semantics that do not rely on color alone.
- A progress update changes the existing row. It does not create an `Updated plan` row every
  time.
- Collapse a completed plan into `Completed 3-step plan` after the next assistant paragraph;
  the user can reopen it without losing details.

## 7. Read, search and exploration rendering

Read-only work should be quieter than Bash or file writes.

Tool identity is part of the normalized event contract. Native structured
`Read`, `Write`, `Edit`, `Grep`, `Glob`, `Bash`, web and MCP calls retain their
tool name and bounded structured input from the native adapter through the
Renderer. A completed result updates the same item; it must not replace the
original tool with a generic `Tool` or `Bash` row.

| Native work | Collapsed row | Expanded content | Primary action |
| --- | --- | --- | --- |
| single file read | `Read AgentComposer.tsx` | safe path, line range, optional bounded excerpt | expanded path |
| repeated reads | `Read 4 files` | ordered file list and ranges | expanded path |
| text search | `Grep providerCatalog` | query, scope and bounded results | expanded result |
| directory/list | `List desktop-agent` | bounded entries | expanded entry |

- Consecutive read/list/search items in the same work phase may coalesce after 300-500 ms.
  Coalescing never crosses an assistant message, write, Bash, approval or error boundary.
- The collapsed label uses a workspace-relative path and a present-tense running form while
  active (`Reading...`, `Searching...`).
- File contents are not dumped into the transcript by default. Expanded excerpts are capped,
  selectable and sanitized.
- Clicking a path opens the existing Editor surface. Agent Chat does not implement a second
  editor.

Provider differences remain truthful:

| Native event | Presentation |
| --- | --- |
| Claude/OpenCode structured `Read` | dedicated Read disclosure |
| Claude/OpenCode structured `Grep` or `Glob` | dedicated search disclosure and bounded result rows |
| Claude/OpenCode structured `Write` or `Edit` | dedicated file-change disclosure and diff/review handoff |
| Codex `fileChange` | Edit/file-change disclosure |
| Codex `commandExecution` running `rg`/`grep` | `Grep <summary>`; expanded details retain the exact shell command |
| Codex `commandExecution` running `find`/`fd`/`rg --files` | `Glob <summary>`; expanded details retain the exact shell command |
| unknown or ambiguous Shell | Bash; never guessed as a safer native tool |

Shell semantic classification is conservative presentation only. It never
changes approval policy, execution provenance, replay identity or the native
event stored in the live projection. Mutating/ambiguous commands remain Bash.

## 8. Bash and command rendering

### Collapsed state

```text
⌘ Bash  npm test
```

While running:

```text
⌘ Bash  npm test                                      o
```

- The label is derived from a redacted command summary, not raw shell output.
- Bash, Read, Grep, Glob, List, Edit and generic tools share one 30 px row skeleton. The icon
  and tool name use the theme accent; the command/path summary is one muted ellipsized line.
- When details exist, the disclosure chevron sits immediately after the tool name, before the
  summary. It never floats at the far-right edge where its ownership becomes ambiguous.
- The collapsed row has no enclosing card, border, success text, duration, exit code, provenance
  suffix or secondary action. A spinner or error status is shown only while it is actionable.
- Adjacent work rows have no card-stack gutter. An assistant paragraph leaves a compact 8 px
  handoff before the first work row, so a sequence reads as one ordered work trace.
- Multiline commands collapse to the first meaningful command plus `+N lines`.
- Environment variables whose names or values are secret-like are redacted before Renderer.

### Expanded state

```text
⌘ Bash  npm test
  |
  | $ npm test
  | PASS tests/desktop-agent.renderer.test.ts
  | 51 tests passed
```

- Expanded details sit under the same row on a quiet two-pixel branch rail; they do not introduce
  a second card header or outer frame.
- Use monospace output with bounded semantic stdout/stderr; ANSI is parsed through an allowlist
  or stripped. Successful exit metadata and timing remain in normalized state but are not printed.
- Follow output only while the user is already at the card bottom. Manual scrolling disables
  tail-follow and reveals a `Latest output` control.
- Enforce main-process byte limits and Renderer line/DOM limits. Truncation says how much was
  omitted. Chat does not add `Copy` or `Open terminal` controls to every row.
- Non-zero exit keeps the failed status and bounded diagnostic output in the transcript. Retried
  commands create a new attempt nested under the same logical work item when correlation is available.
- A recognized read-only Shell command may use a Read/Grep/Glob/List label and icon, but the
  collapsed row does not print `via Bash`. The exact expanded command preserves execution truth,
  while normalized provenance continues to drive approvals and auditing. Presentation never
  pretends that Codex emitted a native Grep tool.

### Command approval

Potentially mutating commands render an anchored blocking dock above the composer before
execution:

```text
Approval required
npm install package-name
Runs in: puppyone desktop

Why: install the missing test dependency
                                      Reject  Allow once
```

The first release exposes Reject and Allow once. It does not hide a durable `always allow`
rule behind a generic confirmation. Focus moves to the dock only when it appears because of a
user-initiated turn; Escape rejects only when that behavior is explicitly announced.

## 9. Write, edit and file-change rendering

The UI must distinguish proposal, execution and applied filesystem truth.

```text
Proposed edits -> approval if required -> applying -> applied -> Review
                                    \-> failed / partially applied
```

Collapsed examples:

```text
Edit  src/app.ts                                      o
Edit  3 files
Edit  1 of 3 files                                    !
```

- The row aggregates additions/deletions only from confirmed file-change events.
- Expanded content lists workspace-relative paths, change type and line statistics. A file
  click opens the existing Editor; the single Composer-level Changes handoff opens review.
- Collapsed file rows do not repeat additions/deletions, `Open file` or `Review` actions. This
  keeps file tools aligned with Bash and Read while preserving the details after expansion.
- A proposed patch is labeled `Proposed` and never contributes to the Changes total until the
  write succeeds.
- Partial failure retains both applied and failed files. It must not say `Edited 3 files` when
  only one write reached disk.
- Renames, deletes, binary changes and files outside the authorized workspace get distinct
  labels. Unsafe or unbounded paths never cross IPC.
- Inline diffs are optional bounded previews. The full diff, comments, stage/revert and review
  workflow remain owned by Changes.

## 10. Generic tools, MCP and unknown events

Known tools use a renderer registry. Unknown tools use a safe fallback instead of raw JSON.

```text
> Called Linear: get_issue                              done
> Used browser: screenshot                              done
? Tool event: future-tool-type                    details
```

- The collapsed row shows a human backend/tool name and a one-line redacted input summary.
- Expanded arguments/results use typed renderers when registered; otherwise show bounded,
  syntax-highlighted, recursively redacted data.
- Secret fields, binary payloads, data URLs, headers and access tokens are never expandable.
- External write/destructive tools use the same permission semantics as local commands.
- Unknown additive events remain visible and do not crash projection or block later terminal
  events.

## 11. Errors, warnings and recovery

- Humanize known errors into one concise row. Raw nested provider JSON belongs behind a
  redacted `Technical details` disclosure, never as the main assistant response.
- Updates referring to the same failed turn/item upsert one error row. Provider error plus
  terminal session error must not produce duplicates.
- Authentication rejection identifies the Agent or backend-scoped Provider,
  clears only incompatible selections and presents its native recovery action.
  It never silently switches Agent or blames the user with an unbounded API body.
- A failed tool preserves prior assistant text, applied file changes and command output.
- Retry is offered only for idempotent inspection/provider operations. Retrying a write or Bash
  command requires a new explicit turn or approval.

## 12. Agent and backend-scoped pickers

Native operating-system `<select>` menus are not the target interaction. Use one accessible,
anchored listbox/popover. The compact surface is deliberately flat: readiness is a row state,
not a second navigation hierarchy.

```text
+ Agent ----------------------------------+
|  PuppyOne Agent                  check  |
|  Codex                           0.144  |
|  Claude Code                     warning|
|  OpenCode                        warning|
|  Cursor Agent                    warning|
+-----------------------------------------+
```

- Agent is chosen in the top-left session sub-header before Model or inference Provider.
  Backend-scoped triggers stay
  hidden or disabled with explanatory text until a registered Agent is selected.
- Every registered Agent row can be selected so the trigger changes immediately. A
  non-ready row shows exactly one right-aligned warning icon; selecting it exposes that
  backend's scoped readiness state but keeps Send disabled. Selection never implies that
  execution gates passed.
- The popover supports arrow navigation, type-ahead/search, Home/End, Enter and Escape; focus
  returns to the trigger on close.
- Agent rows include only the official local product mark, name, compact version/source and
  optional warning. They never expose executable, credential or native-session paths. The
  compact menu has no `Coding Agents`, `Detected`, `Refresh` or descriptive footer chrome.
- Model results are scoped to the selected Agent and, when applicable, its
  selected Provider. Required text/tool filters are backend capability policy;
  image, embedding and TTS-only models never appear in coding-Agent catalogs.
- With no still-valid explicit model selection, the first model in the native backend's
  advertised order is selected. PuppyOne does not reorder that catalog around an `isDefault`
  flag. The user may then choose another advertised model for the current live configuration.
- Missing or unrecognized capability metadata fails closed; it is never interpreted as text +
  tools support. The searchable catalog remains complete in memory while at most 120 option
  rows are mounted. A 500-model catalog therefore stays searchable without a 500-row popover.
- The selected Agent trigger is a borderless sub-header control with its official mark, name and
  chevron. New Session and overflow sit immediately beside it. Model/backend-scoped triggers are
  borderless text controls in the composer and receive a quiet hover surface only while interacting.
  The standard catalog names (`Codex`, `Claude Code`, `OpenCode`, `Cursor Agent`) remain fully
  visible even at the 420 px minimum. The identity first reserves the two header actions, then
  uses all remaining width; only longer third-party names ellipsize at that boundary. Open/selected
  state must not become a solid fill.
- An existing session pins its Agent. Choosing another Agent creates a new
  session after an explicit boundary; it never rewrites the active native session. The trigger
  exposes the accessible description `Switching provider starts a new chat`, and the switch
  clears the current PuppyOne live projection before inspecting the new backend.

## 13. Composer behavior

```text
+------------------------------------------------------+
| Send follow-up                                       |
| GPT-5.x                                      send    |
+------------------------------------------------------+
```

- The first row owns only the textarea. It has 12 px padding on every side and a 64 px
  resting minimum: two 20 px text lines inside that inset. Text grows to six lines/120 px of content,
  then scrolls internally.
- The 38 px second row always owns Send/Stop at the right. When a backend exposes Model selection,
  its borderless control sits at the left; without a Model, the action remains in the same position.
  Model text aligns with the textarea placeholder and uses the same subtle color and 400 weight;
  hover may rise only to muted text. The Composer therefore keeps a stable 102 px resting height.
- Horizontal outside margin is 12 px at every supported sidebar width, matching the Data sidebar's
  row inset, and the Composer radius is the same 6 px row radius. At rest the Composer uses the
  Data tree's existing selected-row surface; focus uses that row's stronger selected-hover gradient.
  This is a one-way Agent-side visual mirror: the Data sidebar remains unchanged and authoritative.
  A ready empty session uses the quiet `Ask about this project` placeholder; follow-ups use
  `Send follow-up`, while setup and recovery states use actionable placeholders. The textarea
  always retains an accessible name.
- Enter submits, Shift+Enter inserts a newline and IME composition never submits early.
- Submit clears the controlled draft synchronously, renders the optimistic user prompt and
  changes Send to a busy indicator before any IPC/session setup await. The first submit reuses
  an in-flight session-preparation promise and never launches a duplicate initialization. A
  rejected start restores the prompt only when the user has not already begun another draft.
- The draft remains editable while Agent setup or runtime repair is required. Send alone is
  disabled and the placeholder explains the next action.
- Attachment, `@` context and lower-frequency mode actions remain capability-driven. The most
  relevant backend-scoped Model/Provider control remains visible; the session-level Agent
  selector must not be duplicated in the composer.
- During a turn, Send becomes Stop unless the capability explicitly supports steer or queue.
  Stop remains a stable target and never moves because a model name changes width.
- The Changes pill is absolutely anchored eight pixels above the Composer boundary, with a real
  visible gap and no surface overlap, while consuming no layout height. It is suppressed while a blocking approval or
  question dock is present. Slash-command results replace it while their menu is open.
- While application discovery/restoration owns the cold-start loader, the entire dock—including
  the Composer—is not mounted. Background native-session preparation begins only after that state
  resolves, keeps the Composer mounted, and remains invisible until a submitted prompt needs its
  truthful `Preparing <Agent>` status.

## 14. Motion tokens

| Interaction | Duration | Property | Rule |
| --- | --- | --- | --- |
| new local prompt | 140 ms | opacity + translateY 4 px | once only |
| first assistant content | 120 ms | opacity | no typewriter |
| menu/popover open/close | 0 ms | none | appears and disappears immediately |
| chevron/status change | 120 ms | rotate/color | no layout animation |
| compact spinner | 900 ms | rotate | running only |
| row expand disclosure | 140 ms maximum | opacity/clip | skip for very large output |
| error transition | 120 ms | border/text color | never shake |

The easing curves come from PuppyOne motion tokens. No animation may hold an input lock or
delay event application. Under `prefers-reduced-motion: reduce`, duration becomes effectively
zero except an optional non-essential spinner replacement.

## 15. Scroll, streaming and performance

- If the viewport is within 80 px of the bottom when a batch arrives, preserve bottom pinning.
- If the user scrolls away, never pull them back. Show a 30 px circular, icon-only
  `Jump to latest` control at the lower center of the transcript. Unread count is conveyed
  through its accessible name, never visible copy or another badge.
- Streaming text and tool progress share a frame budget; projection may update more often than
  React commits, but ordinary commits are capped at one per animation frame.
- Use flattened stable rows, measurement cache and windowing. A 2,000-row transcript mounts at
  most 120 transcript rows.
- Expanding a large command/tool card does not disable transcript virtualization.
- Command output is capped at 64 KiB, inline diff presentation at 240 lines, message text at
  128 KiB, and initial Markdown at 24 KiB/240 blocks. Session UI state uses a 100-session LRU
  with 1,000 measurements per session. The follow-up queue accepts at most 20 prompts and
  reports backpressure instead of silently dropping work.
- Target production Electron scroll/input p95 is at most 16 ms with no interaction Long Task
  above 50 ms during steady streaming.
- Provider discovery, executable probing, Markdown parser initialization and large output
  formatting never run synchronously on the sidebar input path.
- Draft updates do not clone the transcript measurement map, recreate the textarea width
  observer or render the virtual transcript. Growing streamed Markdown uses React's deferred
  rendering path so an external-store delta cannot take priority over typing or scrolling.
- The benchmark suite includes repeated draft-cache writes with 1,000 measurements and
  controlled composer commits beside a 2,000-row transcript; these product-critical files
  remain in source control.

The serial happy-dom benchmark is a synchronous regression signal, not a substitute for the
production Electron gate. Reference M2 Pro results captured 2026-07-12:

| Scenario | mean | p99 | Structural bound |
| --- | ---: | ---: | --- |
| 4,000 events -> 2,000 rows | 2.17 ms | 2.77 ms | deterministic reducer |
| steady delta at 2,000 rows | 0.45 ms | 0.83 ms | indexed update |
| mount/dispose 2,000-row transcript | 4.45 ms | 9.59 ms | <=120 mounted rows |
| initial 128 KiB Markdown response | 12.57 ms | 15.04 ms | 24 KiB/240 initial blocks |
| expanded command + diff | 6.46 ms | 8.95 ms | 64 KiB + 240 lines |
| open searchable 500-model picker | 16.44 ms | 33.08 ms | <=120 mounted options |

Machine-readable evidence lives in
`benchmarks/performance/baselines/issue-027-agent-chat-m2-pro-2026-07-12.json`.

## 16. Responsive and accessibility contract

| Width | Required behavior |
| --- | --- |
| 760 px | full labels and comfortable document measure |
| 560 px | compact secondary labels; same action order |
| 420 px | no ordinary horizontal scroll; provider/model text truncates before actions |

- Every icon-only action has an accessible name and visible focus treatment.
- Transcript uses normal document semantics; live announcements are throttled and do not read
  every streaming token.
- Running/completed/failed state is conveyed through text or accessible description, not color
  alone. Provider status strings normalize into a closed union; an unknown value renders a
  neutral `Unknown status`, never a success checkmark.
- Listboxes, dialogs and blocking docks follow expected focus order. Popovers are not focus
  traps; credential/setup dialogs are.
- Screen readers receive the completed assistant chunk and blocking request, not command-output
  noise by default.

## 17. Acceptance evidence

The UI is not accepted from a static screenshot alone. Evidence must include:

- recorded fixtures for every row type and every terminal state;
- update-in-place tests proving no duplicated plan, activity or backend/provider error rows;
- 420/560/760 px dark/light screenshots for empty, streaming, tool-heavy, approval, error and
  long-session states;
- keyboard-only Agent -> backend-scoped Model selection, composer submission,
  disclosure and approval;
- evidence that switching Agent creates a new session and one backend failure
  leaves other ready Agents unchanged;
- reduced-motion and screen-reader walkthroughs;
- production Electron trace for streaming, scroll anchoring, input latency and mounted-row
  budget;
- a visual review against the approved Cursor reference and PuppyOne token sheet.
