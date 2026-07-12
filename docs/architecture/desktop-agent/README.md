# Desktop Local Agent Chat architecture

Status: backend architecture implemented from
[ADR-005](ADR-005-multi-native-agent-backends.md). The production composition
registers PuppyOne Agent, native Codex, native Claude Code, user OpenCode and
capability-gated Cursor. The shared contract, Registry, Service, persistence
and session model are backend-neutral. Agent-first Renderer integration is a
separate presentation migration. Terminal remains a separate sibling surface.

This document is intentionally made of prose and plain-text diagrams. It does
not require a diagram renderer.

Normative detail is split into two leaf specifications:

- [Cursor-style Chat UI behavior](chat-ui-behavior-spec.md) defines user and
  assistant messages, animation, Bash, read/search, write/edit, tools,
  approvals, popovers, scrolling and visual evidence.
- [Native Agent backend and model discovery](local-agent-connection-discovery.md)
  defines how native Agent backends are discovered and gated separately from
  backend-scoped Provider and Model catalogs.

## Product architecture

```text
PuppyOne Desktop
|
+-- File routing / workspace shell
|     +-- Editor surface
|     +-- Changes surface
|     +-- Right Sidebar
|           +-- Terminal (independent PTY surface)
|           +-- Local Agent Chat
|
+-- Local Agent Chat
      +-- Presentation (React, Cursor-style hierarchy)
      |     +-- out-of-flow session actions + history
      |     +-- virtual timeline
      |     +-- part/tool renderer registry
      |     +-- permission/question docks
      |     +-- Agent-first, backend-scoped composer controls
      |
      +-- Application (provider-neutral)
      |     +-- explicit AgentClientPort
      |     +-- workspace-scoped AgentSessionController
      |     +-- saved-session lifecycle service
      |     +-- explicit phase/state machine
      |     +-- normalized event projection
      |     +-- sequence repair + 32 ms stream batching
      |     +-- session draft/scroll/measurement cache
      |
      +-- Infrastructure adapter
      |     +-- the only feature module allowed to read window.puppyoneDesktop
      |
      +-- Typed preload IPC
      |     +-- explicit session/turn/control calls only
      |     +-- no spawn, stdin, environment, HTTP proxy, URL or password
      |
      +-- Electron main authority
            +-- AgentService: owner/session/order/replay/journal
            +-- AgentRuntimeRegistry
            |     +-- PuppyOne Agent adapter
            |     |     +-- pinned managed OpenCode kernel
            |     +-- Codex native adapter
            |     |     +-- codex app-server
            |     +-- Claude native adapter
            |     |     +-- Claude Agent SDK + Claude Code
            |     +-- user OpenCode native adapter
            |     |     +-- user opencode server/profile
            |     +-- capability-gated native adapters
            |           +-- Cursor / Pi / future
            +-- Backend discovery and readiness
            |     +-- executable + version + auth + protocol gates
            |     +-- backend-scoped provider/model/mode catalog
            +-- workspace/reference authorization
            +-- process shutdown and secret redaction
```

## Concepts that must not be mixed

```text
Agent backend        User-selectable native Agent integration. Examples are
                     PuppyOne Agent, Codex, Claude Code and user OpenCode.

Harness              The selected backend's native loop. Owns reasoning, tool
                     dispatch, context and native execution sessions.

PuppyOne Agent       First-party backend whose internal kernel is a managed,
                     pinned OpenCode harness.

Provider route       Backend-scoped inference transport and billing identity.
                     Some native backends expose no separate Provider control.

Model + variant      Provider-scoped model identity and only the options that
                     model advertises.

Agent profile/mode   Backend-scoped behavior configuration; not a backend or
                     harness.

Local tool           A detected native Agent installation. It becomes a
                     selectable backend only after every readiness gate passes.

Product session      PuppyOne mapping, UI projection and bounded redacted
                     cache pointing to one backend-native session.
```

The first product choice is Agent backend. If the user selects Codex, the
session uses Codex app-server and its native login and thread. If the user
selects Claude Code, it uses Claude's native harness. If the user selects
PuppyOne Agent, it uses the managed OpenCode kernel. No backend is nested
inside another and no backend failure triggers a silent fallback.

Backend selection is visible for a blank composer and immutable after session
creation. Backend-scoped Provider, Model, Variant and Mode controls follow it.
ADR-005 is authoritative for this product decision.

## Layering and one-way dependencies

```text
src/App.tsx
  -> desktop-agent/index.ts                 public feature API
  -> ui/                                    React presentation/composition
       -> application/                      state machine + explicit client port
            -> domain/                      projection + renderer-safe model
                 -> shared/agent-contract/  process-neutral DTO/schema contract

RightAgentPanel.tsx                         only Renderer composition root
  -> infrastructure/electron/               preload adapter
       -> application/AgentClientPort.ts     port implemented by the adapter

Electron IPC
  -> AgentService / application/            ownership and use cases
  -> domain/                                session model
  -> runtime/ AgentRuntimePort              native backend process seam

bootstrap/create-agent-runtime-host.mjs     production composition root
  -> runtimes/<backend>/                    native backend adapters
  -> runtime/ AgentRuntimeRegistry          production composition seam
```

The Registry and Port never import concrete runtimes. The Composition Root may
register multiple production-ready definitions; tests may inject fake
backends. Main domain never imports application or infrastructure; Renderer
domain never imports application, infrastructure or UI. Renderer application
never imports infrastructure, UI, React or browser globals. Only
`infrastructure/electron/electronAgentClient.ts` reads the preload bridge, and
only `RightAgentPanel.tsx` composes that adapter. Every native payload is
normalized and bounded before IPC. `check-agent-architecture.mjs` enforces
these rules in every production build.

## Source layout

The steady-state ownership is:

```text
shared/agent-contract/
  backend-readiness + capability + event + IPC DTO contracts

electron/main/agent/
  domain/                            backend-neutral session aggregate
  application/                       backend-neutral use cases and journals
  runtime/                           AgentRuntimePort / Registry / Host only
  connections/                       bounded executable/readiness primitives
  transports/                        bounded reusable process transports
  runtimes/                          one native adapter package per backend
    opencode-protocol/                shared protocol only; no product identity
      host + allowlisted client + events + policy + adapter
    puppyone-agent/
      puppyone-agent-identity.mjs
      puppyone-agent-runtime-definition.mjs
      managed-opencode-discovery.mjs  pinned bundle/profile authority
    codex/
      discovery + app-server adapter + events + definition
    claude/
      discovery + Agent SDK adapter + events + definition
    opencode-native/
      user-profile discovery + native adapter + events + definition
    cursor/                           discovery + non-selectable protocol gate

src/features/desktop-agent/
  domain/                             projections + Agent-scoped routing
  application/                        backend-neutral session controller
  infrastructure/electron/            only preload bridge implementation
  ui/                                 capability-driven transcript/composer
    AgentBackendPicker.tsx
    AgentProviderPicker.tsx            optional and backend-scoped
    AgentModelPicker.tsx               backend-scoped
```

`runtime/` never imports `runtimes/`. The single bootstrap composition root
injects definitions into the Registry. Each concrete backend package owns its
discovery, protocol, event mapping, native history, capability translation and
cleanup. There is no shared `harness/` package because PuppyOne does not own a
universal loop.

The detailed map below records current backend ownership. Renderer lines
marked `target` remain presentation migration work and are not backend claims.

```text
shared/agent-contract/
  types.ts                           Renderer/preload DTO type source
  constants.mjs                     channel/event/capability vocabulary
  schema.mjs                        strict IPC request/response boundary
  event-schema.mjs                  normalized event validation
  runtime-schema.mjs                inspection + capability validation
  local-connection-schema.mjs       sanitized local-tool inventory DTO
  validation.mjs                    dependency-free schema primitives

electron/main/agent/
  agent-events.mjs                    versioned event envelope/redaction
  agent-persistence.mjs               v3 bounded multi-session journal
  agent-reference-authorization.mjs   realpath and file-size authority
  agent-service.mjs                   session/window/turn orchestration
  bootstrap/
    create-agent-runtime-host.mjs     only concrete-runtime composition root
  application/
    agent-event-journal.mjs           bounded delivery + durable journal writes
    agent-input-policy.mjs            trusted use-case input policy
    agent-runtime-catalog.mjs         discovery/inspection cache
    agent-session-store.mjs           window ownership + retired sessions
  domain/
    agent-session-model.mjs           session aggregate and DTO projection
  migrations/
    legacy-session-format.mjs         v1 Codex + managed opencode ID migration
  security/
    authorized-project-instructions.mjs bounded canonical instruction snapshot
  connections/
    local-agent-inventory.mjs         lazy five-minute cache + per-tool isolation
    local-agent-connection-policy.mjs derived integration/selectability gates
    tools/
      local-agent-tool-registry.mjs   validated descriptor registry
      codex-tool.mjs                  Codex inventory descriptor
      cursor-tool.mjs                 Cursor inventory descriptor
    probes/
      executable-candidates.mjs       non-login deterministic candidate registry
      bounded-probe-command.mjs       1.5s/16KiB direct-spawn boundary
      codex-local-probe.mjs           version + bounded app-server account probe
      cursor-local-probe.mjs          version + redacted status classification
  runtime/
    agent-runtime-port.mjs            native backend + fake-test contract
    agent-runtime-registry.mjs        production registry + main-owned host
    executable-discovery.mjs          bounded generic discovery
  transports/
    jsonl-rpc-connection.mjs          provider-neutral bounded child transport
  runtimes/opencode-protocol/
    opencode-manifest.mjs             release/source/capability pin
    opencode-sidecar-host.mjs         lazy loopback process lifecycle
    opencode-http-client.mjs          pinned SDK + allowlisted HTTP/SSE gateway
    opencode-events.mjs               native-to-AgentEvent mapping
    opencode-security-policy.mjs      fail-closed permission overlay
    opencode-sidecar-adapter.mjs      parameterized AgentRuntimePort adapter
  runtimes/puppyone-agent/
    puppyone-agent-identity.mjs       product ID/descriptor and provenance
    managed-opencode-discovery.mjs    exact bundle integrity + isolated profile
    puppyone-agent-runtime-definition.mjs managed composition
  runtimes/codex/
    codex-discovery.mjs               local CLI discovery/version/auth
    codex-app-server-adapter.mjs      native Codex protocol adapter
    codex-runtime-definition.mjs      production definition
  runtimes/claude/
    claude-identity.mjs               product ID/descriptor
    claude-discovery.mjs              SDK + required user CLI readiness
    claude-agent-sdk-adapter.mjs      native Claude SDK protocol adapter
    claude-events.mjs                 native-to-AgentEvent mapping
    claude-runtime-definition.mjs     production definition
  runtimes/opencode-native/
    opencode-native-discovery.mjs     user executable/profile readiness
    opencode-native-runtime-definition.mjs independent host and profile
  runtimes/cursor/
    cursor-discovery.mjs              bounded inventory/protocol gate
    cursor-runtime-definition.mjs     visible but non-selectable definition

src/features/desktop-agent/
  index.ts                            public feature entrypoint
  application/
    AgentClientPort.ts                 explicit Renderer-side native port
    AgentSessionController.ts         framework-independent controller
    AgentSessionLifecycle.ts          create/switch/fork/archive/delete/history
    LocalAgentConnectionLoader.ts     lazy inventory presentation loader
    AgentEventSynchronizer.ts         batching + replay/gap repair
    SessionUiStateStore.ts            session draft/viewport measurements
    agent-controller-state.ts         state/transition vocabulary
    controllerRegistry.ts             LRU inactive-controller lifetime
  domain/
    agent-contract.ts                 feature-local shared-contract alias
    agent-provider-routing.ts         current Provider -> Model policy
    agent-backend-routing.ts          target: Agent -> scoped control policy
    agent-projection.ts               event -> turn/part/row reducer
    agent-projection-indexes.ts       lazy non-serializable lookup indexes
    agent-projection-types.ts         discriminated presentation model
    agent-projection-readers.ts       bounded payload readers
    agent-activity-presentation.ts    pure Bash/read/write presentation readers
  ui/
    AgentPartRenderer.tsx             discriminated part registry
    AgentBackendPicker.tsx            target: native Agent selection
    AgentProviderPicker.tsx           backend-scoped inference routes
    AgentModelPicker.tsx              backend/provider-scoped model selection
    AgentPickerPopover.tsx            keyboard/ARIA/search disclosure primitive
    activity/                         Bash/read/write/plan/reasoning renderers
    AgentQuestionDock.tsx             typed blocking questions
    AgentChangesPill.tsx              aggregate additions/deletions handoff
    SafeMarkdown.tsx                  no-innerHTML Markdown surface
    AgentTranscript.tsx               <=120 mounted virtual rows
    AgentComposer.tsx                 /, @, files and Agent-scoped controls
    AgentVisualSmokeHarness.tsx       deterministic 420/560/760 visual QA
    RightAgentPanel.tsx               view composition only
    desktop-agent.css                 import-only public style entry
    styles/
      foundation.css                  panel/session/provider boundary
      transcript.css                  conversation + safe Markdown
      activities.css                  tool/command/diff/changes rows
      blocking.css                    approval/question docks
      composer.css                    composer + provider/model popovers
      responsive.css                  container/motion/visual-QA rules
  infrastructure/electron/
    electronAgentClient.ts            only preload bridge access in feature
  visual-smoke.ts                     QA-only secondary feature entrypoint
  agentTypes.ts                       migration-only type re-export
  agentProjection.ts                  migration-only projection re-export

vendor/opencode/
  runtime-manifest.json               immutable release artifact hashes
  PROMPT_MANIFEST.json                source prompt hashes/order
  SOURCE_ADOPTION.md                  exact source ledger
  LICENSE                             upstream MIT text

vendor/claudian/
  SOURCE_ADOPTION.md                  exact frontend pattern/file ledger
  SBOM.cdx.json                       CycloneDX source-reference record
  LICENSE                             upstream MIT text
```

## Responsibility and lifecycle closeout

The implementation is split at transaction and ownership boundaries rather
than at arbitrary line counts. Known hotspots have hard growth budgets in the
architecture checker.

```text
Renderer live-session orchestration
  AgentSessionController                  <= 500 lines
    +-- AgentEventSynchronizer            streaming/gap replay/disposal
    +-- AgentSessionLifecycle             saved-session mutations/history
    +-- LocalAgentConnectionLoader        lazy local inventory
    +-- SessionUiStateStore               bounded ephemeral LRU

Pure projection
  agent-projection.ts                     <= 550 lines
    +-- agent-projection-readers.ts        hostile payload normalization
    +-- agent-projection-indexes.ts        lazy lookup indexes

Main transaction coordinator
  agent-service.mjs                       <= 850 lines
    +-- agent-input-policy.mjs             authorization/input policy
    +-- agent-session-store.mjs            owner/session lifecycle
    +-- agent-event-journal.mjs            replay/persistence/delivery

Presentation
  desktop-agent.css                       import-only entry
    +-- six responsibility stylesheets    each <= 450 lines
```

`agent-service.mjs` deliberately retains create/resume/turn/approval/question
transaction ordering in one coordinator: splitting those correlated security
mutations across independent services would weaken owner and blocker
invariants. Event journaling was extracted because it has an independent
bounded contract. The pure projection reducer remains one exhaustive event
transition table; payload readers and indexes are separate.

All growing state has an explicit bound:

```text
controller history                  100 sessions
queued follow-ups                    20 prompts; overflow is reported
session UI cache                    100 LRU sessions
row measurements                  1,000 per session
event synchronizer buffer         2,000 events
main replay journal               1,000 events / 2 MiB
assistant/user message text         128 KiB per message
activity/command text                64 KiB
initial Markdown DOM                 24 KiB / 240 blocks
picker option DOM                   120 rows; full catalog stays searchable
```

Dispose is terminal for Renderer services. Late inventory, event replay or
initialization results cannot mutate a released controller. Sidebar unmount
still does not stop a main-process turn; it only releases Renderer observers.

## Three owners of truth

```text
Backend-native truth
  native auth, agent loop, tools, messages/parts, native session,
  compaction, fork lineage and native history where supported
                    |
                    v
PuppyOne main-process truth
  backend readiness, native-session mapping, canonical workspace, window
  owner, backend-scoped selection, approval/question correlation, normalized
  sequence and bounded redacted projection cache
                    |
                    v
Renderer presentation truth
  turns/parts/rows, expanded cards, draft, Agent/backend-scoped controls,
  scroll anchor and row measurements
```

The selected backend's native session is the canonical conversation and
execution record. The PuppyOne journal is a bounded product index and replay
cache, not an independent source of Agent truth. On a partial or conflicting
restore, normalized native history wins.

React unmount, Sidebar hide and window blur do not terminate a turn. Explicit
Stop, a terminal runtime event, window destruction or app quit can do so. A
window/session close awaits a bounded native abort before releasing an active
adapter, so a native process cannot leave an ownerless turn running. App quit
also waits for backend resources created by inspection even when no product
session exists; resource state is tracked separately from session count.

## Presentation system

The Chat surface follows a document-first coding-assistant hierarchy while
remaining a PuppyOne component. It borrows interaction proportions, not brand
assets or hard-coded colors.

```text
Right sidebar surface
|
+-- on-demand session chrome          out of document flow
|     history / new / overflow        visible on hover or keyboard focus
|
+-- virtual conversation document
|     user turn                       right-aligned quiet prompt bubble
|     assistant turn                  unboxed readable document flow
|     tool/plan activity              quiet text rows + progressive disclosure
|     answer actions                  right-aligned truthful actions
|
+-- blocking dock                     approval or structured question
|
+-- Changes pill                      real aggregate + / - counts
|
+-- anchored composer
      compact two-zone geometry       64 px resting height
      left + menu                     attachments / context / Agent mode
      middle input                    bounded multiline up to 184 px
      right controls                  Agent -> backend-scoped controls / send
```

Visible role badges remain absent from each message because material and
document order communicate authorship. The selected Agent is shown in session
chrome and the composer rather than repeated on every message. User turns use
a right-aligned quiet raised surface; assistant turns stay on canvas so long
answers read like a document. Buttons
appear only for real capabilities: the UI does not draw decorative microphone,
rating or permission controls without an implemented action behind them.

All `.desktop-agent-*` rules live behind the import-only
`ui/desktop-agent.css` entry in responsibility modules under `ui/styles/`; global
`styles/layout.css` owns only the generic right-sidebar host. This prevents
cascade order from changing the component when unrelated shell CSS evolves.
The feature stylesheet uses semantic PuppyOne tokens, 12-16 px responsive
outside gutters, an 18 px user-message radius, a 64 px resting composer and
container breakpoints at 760, 560 and 420 px. Focus and reduced-motion
fallbacks remain explicit. Exact target geometry and animation tokens live in
[Cursor-style Chat UI behavior](chat-ui-behavior-spec.md).

`#agent-visual-smoke` dynamically loads a deterministic conversation through
the `visual-smoke.ts` secondary entrypoint. It is retained as a visual QA
fixture while staying outside the normal Agent bundle and network/session
path. Architecture tests enforce the CSS ownership boundary, responsive
contracts, bounded growing composer and Changes aggregation. The target visual
contract adds an Agent selector without reintroducing the old card stack or an
unbounded native menu. `desktop-agent.cursor-visual-contract.test.ts` must lock
the approved reference geometry.

## Agent and backend-scoped routing boundary

Agent backend selection and backend-scoped model selection are explicit
application state. Neither is inferred from labels in React.

```text
AgentRuntimeRegistry
  +-- discovered backend descriptors and readiness
  +-- capability snapshot
  +-- backend-scoped Provider / Model / Mode catalog
             |
             v
AgentSessionController
  +-- selectedRuntimeId for a blank/new session
  +-- selected Provider/Model valid only inside that backend
  +-- created session pins runtimeId
             |
             v
Composer: Agent -> backend-scoped controls -> Send
```

Electron main revalidates Backend, Provider, Model and Mode against the latest
inspection so a stale or compromised Renderer cannot inject arbitrary routing.
Executable presence alone is not readiness: version, protocol, authentication,
model/tool capability, workspace and product-policy gates must pass. The
PuppyOne Agent adapter additionally trusts only OpenCode's connected Provider
catalog, never its configuration catalog.

## Main-process Agent backend contract

Every adapter provides the required `AgentRuntimePort` methods:

```text
inspect
createSession / resumeSession / readHistory
startTurn / interruptTurn
dispose

optional by capability:
steer, queue, fork, compact, approval, question,
attachment, context, model, mode, commands, MCP and skills
```

The port is the Electron/native-process boundary. Production composition
registers every backend that has passed its product gate. `AgentRuntimeHost`
owns process shutdown and `AgentService` applies create/resume/turn/replay
without backend-name lifecycle branches.

Providers, models, variants and modes come from the selected backend's
inspection. Options stay backend-scoped. Provider errors are normalized in
main; the projection also unwraps bounded legacy JSON error strings so old
journals remain readable.

## PuppyOne Agent OpenCode process and trust boundary

This section applies only when `runtimeId` is `puppyone-agent`. Native Codex,
Claude Code, user OpenCode and future backends define equivalent protocol and
security records in their own adapter documentation.

```text
First Chat inspection or session
      |
      v
discover verified PuppyOne-managed current or previous runtime only
      |
      v
verify release version + archive provenance + executable SHA-256
      |
      v
allocate random 127.0.0.1 port and 32-byte secret
      |
      v
spawn: opencode serve --hostname 127.0.0.1 --port <random>
      |
      +--> health polling (bounded)
      +--> one global SSE connection (reconnecting)
      +--> allowlisted session/provider/permission/question methods
      |
      v
graceful SIGTERM on app quit; bounded wait; SIGKILL fallback
```

Only Electron main knows the URL, Basic-auth value, executable path or process
environment. The renderer receives normalized DTOs. The sidecar is lazy so app
startup and the file Sidebar critical path do not pay its startup cost.

Release CI stages the immutable `v1.17.18` artifact with
`scripts/stage-opencode-runtime.mjs`. That command checks archive filename,
size and SHA-256, verifies `--version`, computes the extracted binary hash and
writes `verified-runtime.json`. Discovery recomputes the binary hash. A prior
verified slot is retained when staging an update and is considered after a bad
current slot. Application releases also remain the outer rollback unit.

Customers never install or update OpenCode for PuppyOne. Production discovery
does not scan PATH, Homebrew or `~/.opencode/bin`; an external runtime exists
only behind an explicit development opt-in. Local `npm run dev` prepares the
same pinned artifact through `scripts/prepare-opencode-dev-runtime.mjs`.
Missing or incompatible engine state is presented as a PuppyOne repair/update,
while the Composer remains draftable. ADR-004 defines distribution, SDK and
pricing ownership.

The sidecar runs with an app-owned `OPENCODE_CONFIG_DIR`. Because that upstream
flag is additive rather than isolating, PuppyOne also redirects the XDG
config/cache/state roots and OpenCode's home-directory config scan to an
app-owned profile; OpenCode's provider credential data remains owned by
OpenCode. Automatic workspace config, workspace/external skills, Claude
compatibility prompts, external plugins, auto-update, sharing and automatic
LSP downloads are disabled. This
prevents a repository checkout or inherited environment variable from
silently starting an MCP command, loading executable plugin code or replacing
the permission policy. Native provider authentication remains in OpenCode's
credential store and provider environment variables remain main-only.

## PuppyOne Agent prompt and permission composition

This section is part of the `puppyone-agent` boundary above. Native Codex,
Claude Code and other backends preserve their own prompt and permission
composition, then expose normalized capability and blocking-request events at
the adapter boundary.

```text
OpenCode agent/mode prompt, otherwise provider-specific base prompt
      + runtime environment and working directory
      + main-managed global instructions (empty by default)
      + main-managed MCP instructions (none until explicitly authorized)
      + main-managed or built-in skills catalog
      + PuppyOne main-authorized AGENTS.md / CLAUDE.md / CONTEXT.md
      = native model system input
```

Only the first recognized instruction filename at the canonical workspace root
is used. It must resolve inside the workspace, be a regular UTF-8 text file and
be at most 256 KB. It is sent through OpenCode's native per-request `system`
field, so provider transforms, title, summary and compaction remain upstream.
For a discovered native slash command, whose upstream command endpoint has no
`system` field, the same authorized instructions are attached as a bounded
`text/plain` file part. Unknown `/text` remains an ordinary user prompt.

Every created, resumed, forked or mode-switched session receives a final
PuppyOne ruleset. Unknown, plugin and MCP tools ask by default; ordinary
workspace read/search/question/skill/todo operations remain available; `.env`
reads ask; plan mode denies every non-allowlisted tool, including shell, edit,
task, plugin and MCP tools. Permission replies still require the
main-owned window/session/turn/request correlation.

## Shared session and event flow

```text
User submit
   |
   v
Controller --typed request--> preload --authorized IPC--> AgentService
   |                                                   |
   |                                                   v
   |                                             runtime adapter
   |                                                   |
   |                                             native harness
   |                                                   |
   +<-- virtual rows <-- projection <-- AgentEvent <----+

Native delta bursts -> main ordering/redaction -> controller 32 ms batch
Permission/question -> immediate flush -> typed blocking dock -> correlated reply
Sequence gap -> bounded replay -> buffered-event reconciliation -> projection
Terminal event -> turn state + queued follow-up (only when capability permits)
```

For PuppyOne Agent, the upstream SSE endpoint has no replay cursor. Its adapter
therefore pauses delivery after a successful reconnect, reads native messages
plus pending permissions/questions and session status, projects the active
turn again by stable IDs, then releases newly buffered events. Main
deduplicates blocking request IDs. An immediately arriving `idle` event cannot
overtake this reconciliation barrier and hide the final answer. Other backends
implement equivalent gap repair using their native history and event contract;
they do not emulate OpenCode SSE.

The envelope contains `runtimeId`, application `sessionId`, native session ID,
turn/item IDs, monotonic sequence, time, type and a bounded payload. The old
`provider` field remains as a migration alias. Journal v1 Codex records migrate
to v2 records on read.

## Projection and timeline

```text
runtime event
   v
Normalized AgentEvent
   v
AgentTurn[] + discriminated AgentPart[]
   v
stable TimelineRow[]
   v
binary-search viewport + overscan + measurement cache
   v
at most 120 mounted row wrappers
```

Parts cover user, assistant Markdown, reasoning, plan, tool, command, file
change, usage, warning/error, permission, question and unknown fallback.
Repeated deltas update one stable part ID. Renderer registries choose a part or
tool view. Unknown events show a bounded label rather than raw JSON.

`SafeMarkdown` creates React nodes and has no `dangerouslySetInnerHTML` path.
Only `http`, `https` and `mailto` links become anchors. Tool and command text is
bounded in main and projection layers.

## Security invariants

- Every workspace comes from window state and is realpathed in main.
- Every attachment and `@` reference must be an absolute, existing regular
  file whose resolved path stays inside that workspace; count and bytes are
  bounded. Main opens it without following a final symlink and passes an
  immutable bounded data snapshot to the harness, closing the authorization/
  read race without exposing bytes back to Renderer.
- Session, turn, runtime, request and window ownership must all correlate.
- Stale permission/question requests fail closed on turn end, interrupt,
  runtime exit, reload and close.
- No generic spawn/stdin/environment/HTTP IPC exists.
- Runtime processes always use an absolute executable and `shell: false`.
- No auto-approve, `--force`, `--yolo` or permission bypass is enabled.
- URL/password/token/environment values are excluded from snapshots, renderer,
  normal logs and persistence.
- Persistence is `0600`, atomic, redacted and bounded by sessions, events and
  bytes.

PuppyOne Agent adds these managed-kernel invariants:

- Repository config cannot auto-load MCP commands, external skills or plugins;
  the managed profile is empty until a main-authorized capability is added.
- Inherited `OPENCODE_CONFIG*`, `OPENCODE_PERMISSION`, auth-content and server
  credential overrides are removed before spawn.

Native backends may use their documented user-owned configuration only through
their own adapter policy. PuppyOne does not silently replace that profile with
the managed PuppyOne Agent profile.

## Performance and accessibility contract

- A backend starts only when its inspection or a session requires it.
- Streaming text is batched at 32 ms; blocking and terminal events bypass the
  batch.
- A 2,000-row fixture mounts no more than 120 rows.
- Measurement, scroll position and pinned-to-bottom state are session-scoped
  and survive switching; row-height changes above the viewport compensate the
  scroll anchor instead of moving the text being read.
- The panel uses container breakpoints at 420/560/760 widths and cannot create
  ordinary horizontal overflow.
- Keyboard submit is IME-safe; Shift+Enter adds a line.
- Buttons, menus, docks and status changes have labels/roles/live regions.
- Focus uses PuppyOne tokens; dark/light themes inherit semantic tokens;
  reduced-motion disables caret/spinner/row motion.

## Extension contract

Adding a native Agent backend registers a new definition, adapter, discovery,
capability map and native-session policy. Adding a model provider inside
PuppyOne Agent instead extends the managed OpenCode catalog. These are distinct
extension paths. Neither may introduce silent fallback or cross-backend model
selection.

`AgentRuntimePort` remains stable so Electron process management and tests do
not depend on native harness internals. A fake backend can implement it in
tests. Product UI consumes capabilities and catalogs rather than concrete IDs.

Adding an event requires one shared event vocabulary change, main normalization,
domain projection and an optional UI registry entry. Shared constant/type drift,
malformed IPC input, malformed responses and invalid blocking events have
contract tests. Unknown native events remain bounded fallbacks instead of raw
payloads.

Adding a tool-specific view registers a Renderer in
`AgentToolRendererRegistry`; it does not add provider conditions to the panel or
controller. Cross-feature consumers import only `desktop-agent/index.ts`.

## Related records

- [OpenCode sidecar ADR](ADR-001-opencode-sidecar.md)
- [Agent contract and boundary ADR](ADR-002-agent-contract-and-boundaries.md)
- [Multi-native Agent backend ADR](ADR-005-multi-native-agent-backends.md)
- [Superseded OpenCode-only product harness ADR](ADR-003-opencode-only-chat-harness.md)
- [Managed Agent engine distribution ADR](ADR-004-managed-agent-engine-distribution.md)
- [OpenCode adoption spike](opencode-adoption-spike.md)
- [OpenCode update and rollback runbook](opencode-upgrade-runbook.md)
- [Right Sidebar product contract](right-sidebar.md)
- [OpenCode source ledger](../../../vendor/opencode/SOURCE_ADOPTION.md)
- [Claudian frontend source ledger](../../../vendor/claudian/SOURCE_ADOPTION.md)
