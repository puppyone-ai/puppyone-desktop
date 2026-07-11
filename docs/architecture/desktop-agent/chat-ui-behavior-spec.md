# Cursor-style Agent Chat UI behavior specification

Status: implemented normative contract for the experimental Desktop Agent Chat surface. The
remaining production evidence gates are recorded in ISSUE-027 rather than left implicit here.

This specification turns the visual direction in [Right Sidebar Agent Chat](right-sidebar.md)
into implementable rules. The pixel reference is the MIT-licensed frontend in
[`YishenTu/claudian@7d7cc84c`](https://github.com/YishenTu/claudian/tree/7d7cc84c60a77431aaccda7ff49a2f1f4ae1c2ab),
especially its message, tool-call, inline-diff, input and model-selector modules. PuppyOne owns
the React port, design-token mapping, accessibility improvements and security boundary. Claudian
provider/runtime/session code is not adopted; OpenCode remains the only product Chat harness.
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
Control layer            context + Provider -> Model + send/stop
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
| | +   OpenAI   GPT-5.x                  mic/send   | |
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
- Message actions appear after the message settles: Copy is required; feedback actions are
  optional product features and must not shift the text when they appear.
- Raw chain-of-thought is never shown. A provider-supplied reasoning summary is a separately
  labeled, collapsed part.

## 6. Plan rendering

Plans are one mutable block per turn, not one card per update.

```text
Plan
  [done] Inspect provider discovery
  [work] Add Provider -> Model routing
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

- The collapsed row shows a human provider/tool name and a one-line redacted input summary.
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
- Authentication rejection identifies the Provider, clears the invalid selection and presents
  `Reconnect`/`Choose another Provider`; it does not blame the user with an unbounded API body.
- A failed tool preserves prior assistant text, applied file changes and command output.
- Retry is offered only for idempotent inspection/provider operations. Retrying a write or Bash
  command requires a new explicit turn or approval.

## 12. Provider and Model picker

Native operating-system `<select>` menus are not the target interaction. Use an accessible,
anchored listbox/popover so status, grouping, search and secondary text remain consistent.

```text
+ Provider ------------------------------------------------+
| Search providers...                                     |
|                                                          |
| Connected routes                                         |
|  * OpenAI / ChatGPT             Connected               |
|    Anthropic                     Connected               |
|                                                          |
| Local tools detected                                     |
|    Codex CLI 0.144.1             Detected - connect      |
|    Cursor Agent 2026.07.09       Detected - no bridge    |
|                                                          |
|  + Connect another provider                              |
+----------------------------------------------------------+
```

- Provider is chosen before Model. The Model trigger is hidden or disabled with explanatory
  text until a selectable Provider route exists.
- Connected routes are selectable. Detected local tools are always visible but are selectable
  only when their connection has passed the rules in
  [Local Agent and Provider Discovery](local-agent-connection-discovery.md).
- The popover supports arrow navigation, type-ahead/search, Home/End, Enter and Escape; focus
  returns to the trigger on close.
- Provider rows include name, connection source and status. They never expose credential
  values or local credential paths.
- Model results are scoped to the selected Provider and limited to text-input, text-output,
  tool-capable, non-deprecated models. Image, embedding and TTS-only models are excluded.
- A selected route is rendered compactly in the composer. Long names ellipsize without
  shrinking Send or covering the textarea.

## 13. Composer behavior

```text
+------------------------------------------------------+
| Send follow-up                                       |
|                                                      |
| +  OpenAI  GPT-5.x  Agent                 mic/send   |
+------------------------------------------------------+
```

- Resting height is 64 px at normal sidebar widths. The text region grows to 184 px, then
  scrolls internally; the control row remains visible.
- Horizontal outside margin is 12 px at 420 px and 16 px at 560/760 px. Inner horizontal
  padding is 12-14 px; radius is 20 px.
- Enter submits, Shift+Enter inserts a newline and IME composition never submits early.
- The draft remains editable while Provider setup or runtime repair is required. Send alone is
  disabled and the placeholder explains the next action.
- `+` owns attachment, `@` context and lower-frequency Agent/mode actions. Provider and Model
  remain visible routing controls.
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
- Target production Electron scroll/input p95 is at most 16 ms with no interaction Long Task
  above 50 ms during steady streaming.
- Provider discovery, executable probing, Markdown parser initialization and large output
  formatting never run synchronously on the sidebar input path.

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
  alone.
- Listboxes, dialogs and blocking docks follow expected focus order. Popovers are not focus
  traps; credential/setup dialogs are.
- Screen readers receive the completed assistant chunk and blocking request, not command-output
  noise by default.

## 17. Acceptance evidence

The UI is not accepted from a static screenshot alone. Evidence must include:

- recorded fixtures for every row type and every terminal state;
- update-in-place tests proving no duplicated plan, activity or provider error rows;
- 420/560/760 px dark/light screenshots for empty, streaming, tool-heavy, approval, error and
  long-session states;
- keyboard-only Provider -> Model selection, composer submission, disclosure and approval;
- reduced-motion and screen-reader walkthroughs;
- production Electron trace for streaming, scroll anchoring, input latency and mounted-row
  budget;
- a visual review against the approved Cursor reference and PuppyOne token sheet.
