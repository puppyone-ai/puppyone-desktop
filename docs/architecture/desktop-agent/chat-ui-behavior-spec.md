# Cursor-style Agent Chat UI behavior specification

Status: implemented transcript/activity foundation plus target Agent-first
selection contract. Multi-native backend selection from ADR-005 remains
migration work and requires new visual and interaction evidence.

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
- repeated updates mutate one stable row instead of appending duplicates;
- proposed work, approved work and completed work are visibly different states;
- raw provider JSON, ANSI control sequences and hidden reasoning are never rendered directly;
- animation communicates state change but never delays input, approval or Stop;
- replaying or restoring a session does not replay entrance animations;
- reduced-motion mode preserves every state without translation, shimmer or pulse.

## 2. Surface anatomy

```text
+------------------------------------------------------+
| New chat                                  history  ...|
|------------------------------------------------------|
|                                                      |
|                   +-------------------------------+  |
|                   | User prompt                   |  |
|                   +-------------------------------+  |
|                                                      |
| Assistant answer in document flow                    |
|                                                      |
| > Explored 4 files                              done |
| > Ran npm test                                  done |
| > Edited 3 files                         Review       |
|                                                      |
| [approval or question dock, only when blocking]      |
| [Changes +42 -11]                                    |
| +--------------------------------------------------+ |
| | Send follow-up                                   | |
| | +   Codex    GPT-5.x                  mic/send   | |
| +--------------------------------------------------+ |
+------------------------------------------------------+
```

Only the transcript scrolls. The decision dock, Changes handoff and composer stay anchored
at the bottom in normal document layout. They must not be fixed over transcript content.

## 3. Shared row state model

Every activity renderer consumes the same presentation state instead of inventing its own
loading and error vocabulary.

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
| succeeded | normal icon | optional duration / `done` | none after settle |
| failed | error icon | `Failed` | one color transition, no shake |
| cancelled | muted icon | `Stopped` | none |

`runtimeId + nativeSessionId + turnId + itemId` is the stable identity. Delta, progress,
completion and retry events update that identity. Sorting by arrival time is not an acceptable
substitute for stable event correlation.

## 4. User messages

```text
                                      +------------------------------+
                                      | Fix the sidebar scroll stall |
                                      | [@RightSidebar.tsx]          |
                                      +------------------------------+
                                                       Copy  10:42 PM
```

### Layout

- Align to the right; maximum width is `min(86%, 720px)` and minimum intrinsic width is
  content-sized.
- Use a quiet secondary surface, one subtle border and an 18 px radius. Do not add a drop
  shadow in the resting state.
- Use 12 px vertical and 14 px horizontal padding. Preserve user whitespace and wrap long
  paths, URLs and CJK text without horizontal scrolling.
- Render `@` context, attachments and quoted files as compact chips below the text inside the
  same bubble. Chips show a safe basename, never an unbounded absolute path.
- Actions are hidden visually until hover or keyboard focus but remain reachable by tab. The
  first required action is Copy. Editing a sent prompt is not implied; a correction is a new
  follow-up turn.

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
  the product body size and a 1.55-1.7 line height.
- The first visible assistant content may fade in over 120 ms. Subsequent tokens do not use a
  per-character typewriter animation.
- Text deltas are coalesced into at most one visual commit per 24-50 ms; permission, question,
  tool-boundary and terminal events bypass the text batch so ordering stays correct.
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
- Message actions appear after the message settles: Copy is required; feedback actions are
  optional product features and must not shift the text when they appear.
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

| Native work | Collapsed row | Expanded content | Primary action |
| --- | --- | --- | --- |
| single file read | `Read AgentComposer.tsx` | safe path, line range, optional bounded excerpt | Open file |
| repeated reads | `Explored 4 files` | ordered file list and ranges | Open file |
| text search | `Searched for “providerCatalog”` | query, scope and match count | Open results |
| directory/list | `Listed desktop-agent` | bounded entries | Reveal folder |

- Consecutive read/list/search items in the same work phase may coalesce after 300-500 ms.
  Coalescing never crosses an assistant message, write, Bash, approval or error boundary.
- The collapsed label uses a workspace-relative path and a present-tense running form while
  active (`Reading...`, `Searching...`).
- File contents are not dumped into the transcript by default. Expanded excerpts are capped,
  selectable and sanitized.
- Clicking a path opens the existing Editor surface. Agent Chat does not implement a second
  editor.

## 8. Bash and command rendering

### Collapsed state

```text
> Ran npm test                                      2.8s
```

While running:

```text
o Running npm test                                00:07
```

- The label is derived from a redacted command summary, not raw shell output.
- Show a compact terminal icon, a single-line command summary, state and duration/exit code.
- Multiline commands collapse to the first meaningful command plus `+N lines`.
- Environment variables whose names or values are secret-like are redacted before Renderer.

### Expanded state

```text
+------------------------------------------------------+
| Terminal  npm test                 Copy   Open terminal|
| cwd  puppyone desktop                                 |
|------------------------------------------------------|
| PASS tests/desktop-agent.renderer.test.ts             |
| 51 tests passed                                       |
|------------------------------------------------------|
| exit 0                                      2.8s      |
+------------------------------------------------------+
```

- Use monospace output with separate semantic stdout, stderr and exit metadata; ANSI is parsed
  through an allowlist or stripped.
- Follow output only while the user is already at the card bottom. Manual scrolling disables
  tail-follow and reveals a `Latest output` control.
- Enforce main-process byte limits and Renderer line/DOM limits. Truncation says how much was
  omitted and offers the existing Terminal/log handoff when available.
- Copy copies the bounded visible/plain output. `Open terminal` transfers context to the
  Terminal owning surface; it does not create a second PTY in Chat.
- Non-zero exit stays in the transcript with `Failed (exit N)`. Retried commands create a new
  attempt nested under the same logical work item when correlation is available.

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
> Editing 3 files                                  running
> Edited 3 files                         +86 -12   Review
! Edited 1 of 3 files                    Partial   Review
```

- The row aggregates additions/deletions only from confirmed file-change events.
- Expanded content lists workspace-relative paths, change type and line statistics. A file
  click opens the existing Editor; Review opens the existing Changes surface.
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

Native operating-system `<select>` menus are not the target interaction. Use an accessible,
anchored listbox/popover so status, grouping, search and secondary text remain consistent.

```text
+ Agent ---------------------------------------------------+
| Search Agents...                                        |
|                                                          |
| Ready                                                     |
|  * PuppyOne Agent               Managed                 |
|    Codex                         Native login            |
|    Claude Code                   API / cloud credential  |
|                                                          |
| Detected                                                  |
|    Cursor Agent                  Protocol unavailable    |
|    OpenCode                      Sign in required        |
|                                                          |
|  Refresh                              Agent settings      |
+----------------------------------------------------------+
```

- Agent is chosen before Model or Provider. Backend-scoped triggers stay
  hidden or disabled with explanatory text until a selectable Agent exists.
- Ready Agents are selectable. Detected native products remain visible but are
  selectable only after every rule in
  [Native Agent backend and model discovery](local-agent-connection-discovery.md) passes.
- The popover supports arrow navigation, type-ahead/search, Home/End, Enter and Escape; focus
  returns to the trigger on close.
- Agent rows include name, source and readiness. They never expose executable,
  credential or native-session paths.
- Model results are scoped to the selected Agent and, when applicable, its
  selected Provider. Required text/tool filters are backend capability policy;
  image, embedding and TTS-only models never appear in coding-Agent catalogs.
- Missing or unrecognized capability metadata fails closed; it is never interpreted as text +
  tools support. The searchable catalog remains complete in memory while at most 120 option
  rows are mounted. A 500-model catalog therefore stays searchable without a 500-row popover.
- A selected Agent/model is rendered compactly in the composer. Long names ellipsize without
  shrinking Send or covering the textarea.
- An existing session pins its Agent. Choosing another Agent creates a new
  session after an explicit boundary; it never rewrites the active native session.

## 13. Composer behavior

```text
+------------------------------------------------------+
| Send follow-up                                       |
|                                                      |
| +  Codex   GPT-5.x  Agent                 mic/send   |
+------------------------------------------------------+
```

- Resting height is 64 px at normal sidebar widths. The text region grows to 184 px, then
  scrolls internally; the control row remains visible.
- Horizontal outside margin is 12 px at 420 px and 16 px at 560/760 px. Inner horizontal
  padding is 12-14 px; radius is 20 px.
- Enter submits, Shift+Enter inserts a newline and IME composition never submits early.
- The draft remains editable while Agent setup or runtime repair is required. Send alone is
  disabled and the placeholder explains the next action.
- `+` owns attachment, `@` context and lower-frequency mode actions. Agent and
  the most relevant backend-scoped Model/Provider control remain visible.
- During a turn, Send becomes Stop unless the capability explicitly supports steer or queue.
  Stop remains a stable target and never moves because a model name changes width.
- The Changes pill sits above the composer, not inside it. Blocking docks sit above both.

## 14. Motion tokens

| Interaction | Duration | Property | Rule |
| --- | --- | --- | --- |
| new local prompt | 140 ms | opacity + translateY 4 px | once only |
| first assistant content | 120 ms | opacity | no typewriter |
| popover open/close | 120/90 ms | opacity + scale 0.98 | anchored origin |
| chevron/status change | 120 ms | rotate/color | no layout animation |
| compact spinner | 900 ms | rotate | running only |
| row expand disclosure | 140 ms maximum | opacity/clip | skip for very large output |
| error transition | 120 ms | border/text color | never shake |

The easing curves come from PuppyOne motion tokens. No animation may hold an input lock or
delay event application. Under `prefers-reduced-motion: reduce`, duration becomes effectively
zero except an optional non-essential spinner replacement.

## 15. Scroll, streaming and performance

- If the viewport is within 80 px of the bottom when a batch arrives, preserve bottom pinning.
- If the user scrolls away, never pull them back. Show `Jump to latest` with an unread count.
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
