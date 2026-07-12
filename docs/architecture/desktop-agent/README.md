# Desktop Local Agent Chat architecture

Status: implemented architecture for the product Chat entry
behind the existing experimental `desktopAgentChat` gate. Production
composition now registers OpenCode only and the UI has no runtime selector.
The existing Codex app-server implementation remains isolated legacy debt, not
a peer runtime or fallback. Terminal remains a separate sibling surface.

This document is intentionally made of prose and plain-text diagrams. It does
not require a diagram renderer.

Normative detail is split into two leaf specifications:

- [Cursor-style Chat UI behavior](chat-ui-behavior-spec.md) defines user and
  assistant messages, animation, Bash, read/search, write/edit, tools,
  approvals, popovers, scrolling and visual evidence.
- [Local Agent and Provider connection discovery](local-agent-connection-discovery.md)
  defines how installed Codex/Cursor tools are recognized separately from
  selectable OpenCode inference Providers.

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
      |     +-- provider/model/variant/agent-mode composer
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
            +-- Local Agent Inventory
            |     +-- Codex/Cursor executable + version discovery
            |     +-- lazy auth/protocol compatibility probes
            |     +-- detected-but-unbridged presentation state
            +-- OpenCode AgentRuntimePort adapter
            |     +-- pinned OpenCode sidecar (only product harness)
            |     +-- connected provider/model/session catalog
            |     +-- text + tools model capability gate
            +-- workspace/reference authorization
            +-- process shutdown and secret redaction
```

## Concepts that must not be mixed

```text
Harness              OpenCode only; owns loop, tools, prompts, permissions,
                     MCP, skills, compaction and native execution sessions.

Provider route       OpenAI/ChatGPT, Anthropic, Google, OpenRouter, Modal or
                     another authorized compatible inference endpoint; owns
                     authentication, inference transport and billing.

Model + variant      Provider-scoped model identity and only the options that
                     model advertises.

Agent profile/mode   OpenCode behavior configuration such as Build or Plan;
                     not a harness.

Local tool           A detected coding-agent installation such as Codex CLI
                     or Cursor Agent. Detection is shown to the user but does
                     not by itself make the tool a selectable Provider.

Product session      PuppyOne mapping, UI projection and bounded redacted
                     cache pointing to one authoritative OpenCode session.
```

“Codex” in the product provider/model controls means an OpenAI/ChatGPT route and
a Codex-family model executed by OpenCode. `codex app-server`, Claude Code and
Cursor CLI are agent products, not automatically valid model providers. They
must still be detected and shown in the Local tools inventory with an exact
status. A future authorized bridge may reuse their compute or credentials only
at the provider layer; it must not replace or nest another loop behind
OpenCode.

The normal Chat UI never exposes harness choice. If OpenCode is unavailable,
Chat fails closed with setup diagnostics instead of silently changing its
semantics. [ADR-003](ADR-003-opencode-only-chat-harness.md) is authoritative for
this product decision.

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
  -> runtime/ AgentRuntimePort              OpenCode process seam

bootstrap/create-agent-runtime-host.mjs     production composition root
  -> runtimes/opencode/                     only new-session harness
  -> runtime/ AgentRuntimeRegistry          infrastructure/test seam only
```

The Registry and Port never import concrete runtimes. Product composition is
fixed to OpenCode; a fake definition may still be injected in contract tests.
Runtime neutrality is an internal dependency rule, not a product-level harness
selector. Main domain never imports application or infrastructure; Renderer
domain never imports application, infrastructure or UI. Renderer application
never imports infrastructure, UI, React or browser globals. Only
`infrastructure/electron/electronAgentClient.ts` reads the preload bridge, and
only `RightAgentPanel.tsx` composes that adapter. OpenCode payloads are
normalized and bounded before IPC. `check-agent-architecture.mjs` enforces
these rules in every production build.

## Source layout

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
  agent-persistence.mjs               v2 bounded multi-session journal
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
    legacy-session-format.mjs         v1 Codex journal compatibility edge
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
    agent-runtime-port.mjs            OpenCode process + fake-test contract
    agent-runtime-registry.mjs        internal registry + main-owned host
    executable-discovery.mjs          bounded generic discovery
  transports/
    jsonl-rpc-connection.mjs          provider-neutral bounded child transport
  runtimes/opencode/
    opencode-manifest.mjs             release/source/capability pin
    opencode-discovery.mjs            exact bundle integrity + fallback
    opencode-sidecar-host.mjs         lazy loopback process lifecycle
    opencode-http-client.mjs          pinned SDK + allowlisted HTTP/SSE gateway
    opencode-events.mjs               native-to-AgentEvent mapping
    opencode-security-policy.mjs      managed config + permission policy
    opencode-project-instructions.mjs canonical project instruction loader
    opencode-sidecar-adapter.mjs      AgentRuntimePort implementation
  runtimes/codex/
    codex-discovery.mjs               local CLI discovery/version/auth
    codex-app-server-adapter.mjs      legacy vertical-slice adapter
    codex-runtime-definition.mjs      pending removal from product composition

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
    agent-provider-routing.ts         pure Provider -> Model selection policy
    agent-projection.ts               event -> turn/part/row reducer
    agent-projection-indexes.ts       lazy non-serializable lookup indexes
    agent-projection-types.ts         discriminated presentation model
    agent-projection-readers.ts       bounded payload readers
    agent-activity-presentation.ts    pure Bash/read/write presentation readers
  ui/
    AgentPartRenderer.tsx             discriminated part registry
    AgentProviderPicker.tsx           connected routes + local tools sections
    AgentModelPicker.tsx              provider-scoped model selection
    AgentPickerPopover.tsx            keyboard/ARIA/search disclosure primitive
    activity/                         Bash/read/write/plan/reasoning renderers
    AgentQuestionDock.tsx             typed blocking questions
    AgentChangesPill.tsx              aggregate additions/deletions handoff
    SafeMarkdown.tsx                  no-innerHTML Markdown surface
    AgentTranscript.tsx               <=120 mounted virtual rows
    AgentComposer.tsx                 /, @, files and Provider/Model controls
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
OpenCode native truth
  provider auth, agent loop, tools, messages/parts, native session,
  compaction, fork lineage and native history
                    |
                    v
PuppyOne main-process truth
  OpenCode process health, native-session mapping, canonical workspace,
  window owner, provider/model selection, approval/question correlation,
  normalized sequence, bounded redacted projection cache and read-only local
  Codex/Cursor installation inventory
                    |
                    v
Renderer presentation truth
  turns/parts/rows, expanded cards, draft, provider/model/mode controls,
  scroll anchor and row measurements
```

OpenCode is the canonical conversation and execution record. The PuppyOne
journal is a bounded product index and replay cache, not an independent source
of agent truth. On a partial or conflicting restore, normalized OpenCode native
history wins.

React unmount, Sidebar hide and window blur do not terminate a turn. Explicit
Stop, a terminal runtime event, window destruction or app quit can do so. A
window/session close awaits a bounded native abort before releasing an active
OpenCode adapter, so a shared sidecar cannot leave an ownerless turn running.
App quit also waits when inspection started the sidecar but no application
session was created; runtime-resource state is tracked separately from session
count so that process cannot become an orphan.

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
      right controls                  provider -> model / stop or send
```

Visible “You”, “OpenCode” or runtime badges are intentionally absent from each
message because material and document order communicate authorship. The
harness is not a product choice. User turns use a right-aligned quiet raised surface;
assistant turns stay on canvas so long answers read like a document. Buttons
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
contracts, bounded growing composer, Changes aggregation and absence of a
runtime selector. `desktop-agent.cursor-visual-contract.test.ts` must lock the
approved reference geometry so later feature work cannot silently reintroduce
the old card stack or native Provider menu.

## Provider routing boundary

Provider selection is an explicit application state, not a label parsed in the
React component and not another runtime registry entry.

```text
pinned OpenCode sidecar
  GET /provider
       |
       +-- all catalog providers
       +-- connected provider IDs          availability authority
       +-- per-provider default model
              |
              v
  OpenCodeSidecarAdapter
       +-- discard unconnected providers
       +-- discard non-text / non-tool / deprecated models
       +-- normalize bounded Provider + Model DTOs
              |
              v
  shared contract + AgentSessionController
       +-- selectedProviderId
       +-- selectedModel belongs to selectedProviderId
       +-- multiple providers require explicit selection
              |
              v
  Composer: Provider -> Model -> Send
```

`/config/providers` describes configuration, not authenticated availability,
and must never be used to enable a session. Electron main revalidates every
requested Model against the inspected connected catalog so a compromised or
stale Renderer cannot inject an arbitrary provider/model string.

CLI installation is also not Provider proof. Codex, Claude Code and Cursor are
agent products; their executables and subscriptions do not automatically grant
OpenCode an inference route. OpenAI/ChatGPT, Anthropic or another service is
shown only when OpenCode reports a legitimate connected Provider. A future
Cursor or CLI credential bridge must be separately authorized and documented;
it cannot silently reuse private credentials or introduce a nested Agent loop.

## Main-process harness contract

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

The port is the Electron/OpenCode process boundary. Production new-session
composition selects OpenCode without asking the user; the Registry exists for
composition, lifecycle isolation and fake-harness contract tests, not for a
product runtime picker. `AgentRuntimeHost` owns sidecar shutdown and
`AgentService` applies create/resume/turn/replay to OpenCode-backed sessions.

Providers, models and variants come from the OpenCode catalog. Options are
model-scoped: a variant is applied only when it exists in the selected model's
`variants` map. Changing an OpenAI/Codex model to an Anthropic/Claude model
therefore changes inference routing without replacing the harness or session
authority. Provider errors are normalized in main; the projection also unwraps
bounded legacy JSON error strings so old journals remain readable.

## OpenCode process and trust boundary

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

## Prompt and permission composition

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

## Session and event flow

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

The upstream SSE endpoint has no replay cursor. On a successful reconnect,
the host therefore pauses delivery, reads native messages plus pending
permissions/questions and session status, projects the active turn again by
stable IDs, then releases newly buffered events. Main deduplicates blocking
request IDs. An immediately arriving `idle` event cannot overtake this
reconciliation barrier and hide the final answer.

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
- Repository config cannot auto-load MCP commands, external skills or plugins;
  the managed profile is empty until a main-authorized capability is added.
- Inherited `OPENCODE_CONFIG*`, `OPENCODE_PERMISSION`, auth-content and server
  credential overrides are removed before spawn.
- URL/password/token/environment values are excluded from snapshots, renderer,
  normal logs and persistence.
- Persistence is `0600`, atomic, redacted and bounded by sessions, events and
  bytes.

## Performance and accessibility contract

- OpenCode starts only when Chat first needs harness inspection or a session.
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

Adding a model provider, compatible endpoint or authorized credential bridge
extends OpenCode's managed provider catalog. It must not add a peer product
harness, runtime selector or silent fallback. Provider/model/variant identity
stays separate in the session contract, and model-specific options must be
validated against the selected catalog entry.

`AgentRuntimePort` remains stable so Electron process management and tests do
not depend on OpenCode internals. A fake harness can implement it in tests. A
second production harness requires a new product ADR and migration policy; it
is not an ordinary provider extension.

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
- [OpenCode-only product harness ADR](ADR-003-opencode-only-chat-harness.md)
- [Managed Agent engine distribution ADR](ADR-004-managed-agent-engine-distribution.md)
- [OpenCode adoption spike](opencode-adoption-spike.md)
- [OpenCode update and rollback runbook](opencode-upgrade-runbook.md)
- [Right Sidebar product contract](right-sidebar.md)
- [OpenCode source ledger](../../../vendor/opencode/SOURCE_ADOPTION.md)
- [Claudian frontend source ledger](../../../vendor/claudian/SOURCE_ADOPTION.md)
