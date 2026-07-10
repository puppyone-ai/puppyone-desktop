# Implementation Brief: Codex Agent Chat Vertical Slice

This is the implementation handoff for the first production-shaped slice of
the [Desktop Agent Architecture](README.md). It is intentionally narrower than
the complete multi-provider architecture.

The first slice integrates Codex only. It establishes the common contracts so
Claude, Cursor, and ACP can be added later without rewriting the renderer or
Electron security boundary.

## Implementation status (July 2026)

**Experimental and off by default:** the Codex vertical slice described by this
handoff is present
under `electron/main/agent/` and `src/features/desktop-agent/`. It includes the
real app-server transport, account/model inspection, thread create/resume,
turn streaming, command/file approvals, interrupt, bounded replay/persistence,
independent Chat/Terminal header switching, tests, and an opt-in no-inference smoke
script (`npm run smoke:codex-agent`, enabled with
`RUN_CODEX_AGENT_SMOKE=1`).

Shipping the code does not expose Chat automatically. Terminal remains
available through its own header icon. The build availability flag and the
persisted Settings → Experimental opt-in must both be true before the separate
Chat header icon appears. The tested minimum Codex version is `0.144.1`.

**Known gaps:** integrated Codex login is deferred in favor of external
`codex login` plus Refresh. Experimental structured questions, permission
requests, MCP elicitations, dynamic tools, and attestation fail closed. The
bounded journal can restore old sessions as partial. Claude, Cursor, ACP, and
Cloud execution remain explicit non-goals for this slice.

## Copy-paste task prompt

Copy the following prompt to the implementation agent:

```text
Implement the first Codex-backed Desktop Agent Chat vertical slice in:

  /Users/supersayajin/Desktop/puppyone desktop

Do not stop after planning or producing a mockup. Implement the feature, add
tests, run the relevant verification, and report remaining gaps accurately.

Read these documents completely, in this order, before editing:

1. docs/architecture/desktop-agent/implementation-brief.md
2. docs/architecture/desktop-agent/README.md
3. docs/architecture/desktop-agent/right-sidebar.md
4. docs/architecture/desktop-terminal-architecture.md
5. docs/architecture/desktop-multi-window-workspaces.md
6. docs/architecture/git/README.md

The required outcome is a structured Chat surface in the existing resizable
right sidebar, next to the existing Terminal surface. Codex must run through
`codex app-server` over stdio JSONL/JSON-RPC in the Electron main process.
Never scrape or parse the terminal UI. Never spawn Codex in the renderer.

Scope the implementation to Codex. Do not add Claude, Cursor, OpenCode,
Hermes, or ACP runtimes in this task. Define provider-neutral contracts where
the architecture requires them, but do not build speculative adapters.

Preserve the existing Terminal behavior and every unrelated worktree change.
Inspect `git status` before editing. Do not discard, rewrite, format, or commit
changes you do not own.

Implement the scope and acceptance criteria in this brief. Keep credentials in
Codex's supported auth store, keep executable/process control in Electron main,
reuse the existing workspace authorization boundary, default approvals to fail
closed, and do not use --force, --yolo, danger-full-access, or shell:true.

Use the installed Codex version's generated schema or the current official
app-server documentation as protocol truth. Do not invent JSON-RPC method or
payload shapes. Tolerate additive unknown fields and report unsupported
versions explicitly.

Before handing back, run at least `npm test`, `npm run build`, and
`git diff --check`. If a check cannot run, explain the exact command and
failure. Update the Desktop Agent docs so implemented behavior is labeled
Implemented and unbuilt behavior remains Proposed.
```

## Implementation objective

Deliver one end-to-end local workflow:

1. A user opens a local workspace.
2. The existing right sidebar opens on Chat or switches between Chat and
   Terminal without destroying either session.
3. PuppyOne discovers the installed `codex` executable and reports readiness.
4. Electron main starts `codex app-server` over stdio.
5. PuppyOne initializes the protocol and reads account/model state.
6. The user starts or resumes a Codex thread for the workspace.
7. The user submits a prompt from the sidebar.
8. Assistant text, tool activity, command output, file changes, and terminal
   turn state stream into the structured transcript.
9. Command and file-change approval requests pause the turn and render a safe
   approval dock.
10. The user can interrupt the turn.
11. Hiding Chat or switching to Terminal does not stop the turn.
12. Returning to Chat restores the committed transcript projection.
13. Closing the window or resetting the Agent session cleans up the owned
    app-server connection and pending requests deterministically.

The vertical slice is not complete if it only renders assistant text while
silently auto-approving tools or losing state when the panel hides.

## Required reading and code orientation

Read the architecture documents listed in the copy-paste prompt first. Then
inspect these current implementation points before changing their contracts:

```text
src/App.tsx
src/components/RightTerminalPanel.tsx
src/components/DesktopCloudShell.tsx
src/features/app-shell/DesktopTitlebarActions.tsx
src/features/app-shell/preferences.ts
electron/main.mjs
electron/preload.cjs
electron/main/terminal-service.mjs
electron/main/ipc/terminal-ipc.mjs
electron/main/workspace-authorization.mjs
electron/main/trusted-ipc.mjs
electron/main/workspace-state-store.mjs
src/types/electron.d.ts
tests/electron.trusted-ipc.test.mjs
tests/electron.workspace-authorization.test.mjs
tests/electron.local-file-capabilities.test.mjs
```

Search for the current right-sidebar width preference, Terminal titlebar menu,
window teardown, IPC registration, and workspace authorization rather than
duplicating them.

The existing Terminal is a reference for lifecycle and security ownership, not
an implementation to generalize into arbitrary process access.

## Scope

### 1. Provider-neutral contracts

Add a small, typed contract for:

- provider readiness;
- provider capability snapshot;
- application session metadata;
- session create/resume/close requests;
- turn start/interrupt requests;
- approval request/resolution;
- normalized versioned `AgentEvent` envelopes;
- renderer bridge methods and event subscriptions.

Keep the initial vocabulary limited to what the Codex vertical slice renders:

```text
session.started
session.resumed
session.closed
turn.started
turn.completed
turn.failed
turn.interrupted
assistant.delta
assistant.completed
reasoning.summary.delta
plan.updated
tool.started
tool.progress
tool.completed
command.output.delta
file.change.updated
usage.updated
approval.requested
approval.resolved
provider.warning
provider.error
```

Do not expose raw Codex protocol unions through preload or React components.
Codex-specific payloads are decoded and normalized in the main process.

### 2. Electron main-process AgentService

Create the service under the proposed `electron/main/agent/` boundary. It must:

- own every live application session;
- bind each session to one `WebContents` owner and canonical workspace root;
- reject cross-window session, turn, interrupt, and approval operations;
- maintain a monotonic sequence for normalized events;
- keep active turns alive while the renderer panel is hidden;
- track pending JSON-RPC requests and fail them closed during interruption,
  provider exit, window close, reset, and app quit;
- bound stdout line length, stderr diagnostics, queued events, and command
  output retained for replay;
- redact secrets from logs and renderer-visible diagnostics;
- close all owned resources symmetrically.

Use the existing workspace authorization path before creating or resuming a
session. Do not accept a renderer-provided cwd merely because it is absolute.

### 3. Codex executable discovery

Desktop-launched Electron may not inherit the user's interactive shell `PATH`.
Discovery must therefore:

- resolve the user's login-shell environment with a timeout;
- find an absolute `codex` executable path;
- run a bounded version check;
- classify readiness as `not-installed`, `unsupported-version`, `ready`, or
  `error`;
- cache the result and support explicit refresh;
- never return the full environment to the renderer.

Do not interpolate a command string into a shell. Spawn the resolved executable
with an argv array.

### 4. Codex app-server adapter

Launch:

```text
codex app-server --listen stdio://
```

Use stdin/stdout as newline-delimited JSON-RPC messages. Capture stderr
separately as bounded diagnostics.

Perform the required handshake:

```text
initialize request
initialized notification
```

Use client metadata similar to:

```json
{
  "name": "puppyone_desktop",
  "title": "PuppyOne Desktop",
  "version": "<app version>"
}
```

Start on the stable protocol surface. Experimental capabilities must be
individually justified and gated by detected version/capability; do not enable
every experimental API to simplify implementation.

Required client operations:

```text
account/read
model/list
thread/start
thread/resume
thread/read or thread/list as needed for restore
turn/start
turn/interrupt
```

Required notifications to normalize:

```text
thread/started
thread/status/changed
turn/started
turn/completed
item/started
item/completed
item/agentMessage/delta
item/reasoning/summaryTextDelta
item/plan/delta or the current generated-schema equivalent
item/commandExecution/outputDelta
item/fileChange/outputDelta or patch update equivalent
thread/tokenUsage/updated
error
```

The exact names and payloads must come from the installed Codex version's
generated TypeScript/JSON schema or current official app-server reference. If a
name in this brief differs from the generated schema, the generated schema wins
and the architecture document should be corrected in the same change.

Required server-initiated requests:

```text
item/commandExecution/requestApproval
item/fileChange/requestApproval
```

Reply with a JSON-RPC result using the same request ID. Prefer the request's
`availableDecisions` when present. At minimum support:

```text
accept
acceptForSession when the provider explicitly offers it
decline
cancel
```

Do not show “Always allow” merely because the UI has room for it.

The following may remain capability-gated follow-up work if they require the
experimental protocol in the installed version, but the adapter must fail them
closed rather than hang:

```text
item/tool/requestUserInput
item/permissions/requestApproval
mcpServer/elicitation/request
dynamic tools
attestation
```

The adapter must distinguish JSON-RPC responses, notifications, and
server-initiated requests. A line with unknown additive fields is not a fatal
protocol error. Malformed framing, duplicate response IDs, and impossible
session ownership are errors.

### 5. Account behavior

The first implementation may reuse an existing Codex login. It must call
`account/read` and render actionable unauthenticated state instead of failing
the first turn with a generic error.

If integrated ChatGPT login is implemented in this slice, use
`account/login/start` with Codex-managed browser/device flow, open the returned
URL through the existing safe external-URL path, and wait for
`account/login/completed` / `account/updated`. Do not collect, log, persist, or
send OAuth tokens through the renderer.

If integrated login is deferred, the UI must state that Codex setup is required
and offer a safe Refresh after the user authenticates with Codex externally.
Do not add an unreviewed API-key text field to the renderer as a shortcut.

### 6. Right sidebar shell

Keep two independent header actions:

```text
[Chat icon] [Terminal icon]
```

Requirements:

- preserve the current 420px to 760px width preference;
- preserve Terminal lazy mount, fit/resize, drag/drop, reset, and cleanup;
- keep one sidebar width and one open/closed state;
- store the last selected right-sidebar panel as a preference;
- do not render Chat/Terminal tabs inside either panel;
- keep `RightAgentPanel` and `RightTerminalPanel` as separate components;
- do not mount two independent right asides;
- do not rename unrelated left-sidebar concepts to Agent;
- keep the first slice limited to local workspaces.

Switching to Terminal must not unmount or kill a running Agent session.
Switching to Chat must not recreate the PTY.

### 7. Chat presentation

Implement a production-shaped minimal presentation, not a fake screenshot:

- session header with New Session and diagnostics;
- Codex readiness/account state;
- model selection when `model/list` succeeds;
- transcript with user and assistant messages;
- compact activity rows for plans, commands, tools, and file changes;
- expandable bounded command output;
- approval dock for command and file-change requests;
- composer with multiline prompt and submit;
- Stop while a turn is running;
- deterministic empty, loading, restoring, failed, interrupted, and provider
  exited states;
- Jump to latest behavior when the user is not pinned to the transcript bottom.

Use the existing design tokens, theme system, scrollbar conventions, focus
styles, reduced-motion preference, and titlebar/menu components. Do not add a
new component library.

Full file content and full diffs open through the existing editor/Review/Git
surfaces. Chat shows compact summaries and links; it does not implement another
full diff editor.

### 8. Projection and visibility lifecycle

The renderer maintains a pure projection from ordered `AgentEvent` envelopes.
The projection should be independently unit-testable.

Required behavior:

- concatenate assistant deltas by item ID and sequence;
- finalize items from authoritative completed events;
- coalesce rapid text deltas without crossing tool/approval boundaries;
- retain partial assistant text after failure/interruption;
- ignore duplicate already-committed sequences;
- identify gaps and request replay or show partial history instead of silently
  reordering;
- keep independent Chat and Terminal scroll state;
- do not announce every streamed token to assistive technology.

The main process retains a bounded event replay buffer for live sessions. A
renderer re-subscribing after hide/remount supplies its last committed sequence.

### 9. Persistence

Persist enough metadata under Electron `userData` to restore a workspace's last
Codex application session:

- application session ID;
- canonical workspace identity;
- Codex thread ID;
- title and timestamps;
- last terminal state;
- selected model/mode where supported;
- last committed sequence and a bounded transcript projection or event journal.

Do not write conversation metadata into the user's repository. Do not persist
credentials. Apply a documented size/retention limit.

If full restart persistence is too large to land safely with the first code
slice, separate it behind a clearly tracked follow-up only after hide/show,
window ownership, and provider cleanup are correct. Do not pretend an in-memory
session survives restart.

### 10. Integration with workspace changes

Agent edits occur in the authorized workspace and must naturally trigger the
existing workspace watcher, file preview refresh, Git refresh, and edit-review
flows.

Do not make the Agent adapter compute authoritative Git status. Do not refresh
the entire app on every text delta. Invalidation follows actual file/tool
events and the existing subsystem contracts.

## Explicit non-goals

Do not implement any of the following in this task:

- Claude Agent SDK;
- Cursor SDK or Cursor CLI;
- OpenCode or Hermes as PuppyOne's internal runtime;
- generic ACP support;
- Cloud workspace agent execution;
- remote Codex app-server WebSocket transport;
- parsing ANSI/TUI output into chat;
- arbitrary shell/process IPC exposed to the renderer;
- voice, browser control, image generation, scheduled agents, or multi-agent
  orchestration;
- a new diff editor, source-control engine, or workspace watcher;
- automatic provider installation or self-update;
- hidden unrestricted permission flags;
- broad refactors of unrelated editor, Git, Cloud, or terminal code.

## Security requirements

- Main process owns provider discovery, spawn, stdin/stdout, request IDs,
  credentials boundary, and cleanup.
- Renderer input is untrusted.
- Every workspace path is authorized and canonicalized in main before use.
- Every session mutation verifies the owning `WebContents`.
- No `shell: true`; no command interpolation; no renderer-provided executable.
- No credentials, environment dump, raw auth response, or unredacted stderr in
  renderer events or logs.
- Approval defaults to deny/cancel when the request cannot be rendered,
  correlated, or answered safely.
- Provider exit, renderer exit, window close, and app quit resolve pending
  requests and kill owned processes without orphaning them.
- Event and output buffers are bounded and tested.
- External URLs use the existing URL validation/opening path.

## Suggested implementation order

1. Add provider-neutral types and pure projection tests.
2. Add AgentService with a fake in-memory adapter and IPC ownership tests.
3. Add the independent Chat header action and panel routing without changing
   Terminal internals.
4. Add the transcript, composer, activity rows, and approval dock against fake
   events.
5. Add Codex discovery and app-server JSON-RPC transport.
6. Map thread, turn, item, delta, usage, error, and approval messages.
7. Add account/read and model/list states.
8. Add start, resume, interrupt, reset, and visibility replay lifecycle.
9. Add persistence if it can land with deterministic cleanup and retention.
10. Run the complete verification contract and update architecture status.

This order keeps UI work testable without consuming model quota and keeps
provider protocol debugging out of React components.

## Required tests

### Pure/unit tests

- normalized event envelope validation;
- transcript projection and delta concatenation;
- duplicate and missing sequence handling;
- item start/progress/completion transitions;
- interrupted/failed partial assistant messages;
- approval queue and stale resolution behavior;
- provider readiness classification;
- JSONL framing, maximum line length, and malformed input;
- JSON-RPC request/response correlation and unknown fields;
- Codex event-to-normalized-event fixtures;
- redaction of known credential/token patterns.

### Electron/service tests

- renderer A cannot access renderer B's agent session;
- an unauthorized workspace or cwd is rejected;
- hide/show does not terminate a turn;
- reset and window close clean up the process;
- provider exit produces terminal session/turn state;
- pending approval fails closed on interrupt/close/exit;
- slow or destroyed renderers do not create unbounded queues;
- app quit closes all adapter processes;
- preload exposes only the explicit Agent API.

### Renderer tests

- independent Chat/Terminal header buttons preserve both surfaces;
- model/readiness/account states;
- streamed assistant text and activity ordering;
- approval actions and disabled/stale states;
- Stop state and terminal turn status;
- bottom pinning versus Jump to latest;
- keyboard navigation and accessible labels for expandable items and approvals;
- narrow 420px and wide 760px layouts without horizontal overflow.

### Opt-in smoke test

Add an opt-in local smoke path that can start the installed Codex app-server,
initialize it, read account/model state, create an ephemeral or disposable
thread, and cleanly close. It must not run by default in CI and must not consume
inference quota unless explicitly requested.

## Required verification

Run from the repository root:

```text
npm test
npm run build
git diff --check
```

Also run any new focused test files during development. If Electron packaging
or `asar` behavior changes, run the relevant packaged-app smoke check and
document it.

Do not claim success based only on browser/Vite mode; provider process and
preload behavior require Electron verification.

## Completion criteria

The handoff is complete only when all of the following are true:

- a real installed Codex app-server drives the structured Chat UI;
- Terminal remains functional and retains its current lifecycle;
- Chat and Terminal switch without killing hidden work;
- renderer code consumes normalized events only;
- main-process ownership and workspace authorization have tests;
- command and file-change approvals are interactive and fail closed;
- Stop produces a confirmed interrupted terminal event rather than only killing
  renderer state;
- provider/account/version errors are actionable and redacted;
- no unrestricted flags or raw process bridge were added;
- targeted tests, `npm test`, `npm run build`, and `git diff --check` pass, or
  any environmental failure is reported precisely;
- the architecture documents accurately distinguish Implemented, Proposed,
  Product gate, and Known gap behavior after the change.

## Handoff report format

The implementation agent should finish with:

1. outcome and user-visible behavior;
2. architecture/code map of the files added or changed;
3. protocol methods/events implemented;
4. security controls and tests added;
5. verification commands and results;
6. remaining proposed work or known gaps;
7. confirmation that unrelated worktree changes were preserved.
