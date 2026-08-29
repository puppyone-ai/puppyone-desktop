# Desktop Agent architecture

Status: current architecture entry point. The multi-native runtime/session and
Composer reference-acquisition paths are implemented. The normative staging,
adapter and transcript rules live in
[Agent Composer reference ingestion](composer-reference-ingestion.md).

PuppyOne Desktop provides one right-sidebar Chat over two execution families:
the first-party `PuppyOne Agent` managed harness and user-owned native Agent
harnesses. The Chat surface and safety-conscious control plane are shared, but
the selected route remains the sole execution and session authority. Codex,
Claude Agent, Cursor Agent and user OpenCode keep their native loops;
PuppyOne Agent exposes one PuppyOne-managed, multi-provider harness whose
current verified kernel is OpenCode.

The accepted decision is
[ADR-006: Native harness adapters and ACP](ADR-006-native-harness-adapters-and-acp.md).
[ADR-005](ADR-005-multi-native-agent-backends.md) defines the product model.

## How to read this package

- Start here for the runtime topology, ownership boundaries, shared contracts,
  and source map.
- Read [Chat Surface](right-sidebar.md) for the right-sidebar container and
  Chat/Terminal relationship.
- Read [Chat Behavior](chat-ui-behavior-spec.md) for session, message, streaming,
  approval, error, and recovery behavior.
- Read [Composer and Context](composer-reference-ingestion.md) for prompt composition,
  references, attachments, and context acquisition.
- Read [Runtime Discovery](local-agent-connection-discovery.md) for executable discovery,
  readiness, and diagnostics.
- Use the [Agent Decision Index](README.md) when the question is
  “why is the architecture this way?”
- Use the [Agent History Index](history/codex-vertical-slice.md) only for superseded
  implementation briefs and research evidence.
- Use the
  [OpenCode Update and Rollback Runbook](opencode-upgrade-runbook.md)
  for the managed PuppyOne Agent kernel.

## 1. Current system map

This is the canonical Agent architecture. A live Chat session selects exactly
one route. PuppyOne never nests one vendor harness inside another and never
silently substitutes a different route. `PuppyOne Managed Harness` is the
first-party product boundary for PuppyOne Agent; it is not a universal harness
that replaces native Agent products.

<!-- agent-runtime-map:start -->
```text
PuppyOne Chat UI / product control plane
  workspace authority / typed IPC / normalized events / approvals / lifecycle
  |
  +-- PuppyOne Agent
  |     -> PuppyOne Managed Harness
  |          -> PuppyOne-owned product policy, provider routing and support
  |          -> current kernel: bundled, pinned OpenCode over ACP
  |          -> isolated PuppyOne profile and native session
  |          -> backend-scoped Provider / Model catalog
  |               +-- PuppyOne managed Gateway / credits
  |               +-- OpenAI API
  |               +-- Anthropic API
  |               +-- OpenRouter
  |               +-- enterprise Gateway
  |               +-- explicitly configured BYO API Provider
  |
  +-- Native Agents
        +-- Codex
        |     -> codex app-server -> Codex harness
        |     -> user's Codex login, entitlement, models and thread
        |
        +-- Claude Agent
        |     -> official Claude Agent SDK + local Claude executable
        |     -> Claude harness; supported API/cloud credentials and session
        |
        +-- Cursor Agent
        |     -> Cursor ACP (`agent acp`) -> Cursor harness
        |     -> user's Cursor login, entitlement, models and session
        |     -> negotiated ACP capabilities plus isolated Cursor extensions
        |
        +-- OpenCode
              -> ACP -> user's OpenCode harness
              -> user's executable, profile, auth, Providers and session
```
<!-- agent-runtime-map:end -->

The Provider branches describe the supported architecture, not a promise that
every route ships in every release. The backend-scoped catalog and entitlement
checks are authoritative for current availability.

The Chat surface never contains a hidden universal OpenCode requirement. If the
user selects Codex, Claude Agent, Cursor Agent or OpenCode, that product's
native harness owns the whole loop. OpenCode is the current internal kernel
only for PuppyOne Agent and the explicit user OpenCode route; those two
profiles, credentials and sessions remain isolated.

PuppyOne Chat is the visible desktop client and control plane; it is not an
interactive terminal or a text-scraping CLI surface. Native routes may launch a
locally installed executable behind a bounded protocol (`app-server`, ACP, or
an official SDK), but the executable is an implementation endpoint. The user
selects the Agent product in Chat and never has to compose its CLI command.

### Route-selection policy

The selected **Agent**, not the requested model family, determines the harness:

| User intent | Required route | Credential and billing authority | Session authority |
| --- | --- | --- | --- |
| Use PuppyOne's unified experience and switch among supported Providers/models | PuppyOne Agent -> PuppyOne Managed Harness | PuppyOne Gateway/credits, enterprise Gateway, or an explicitly configured API Provider | PuppyOne Agent's managed native session |
| Use Codex product behavior, configuration or entitlement | Codex -> Codex harness | user's native Codex/OpenAI product account | Codex thread |
| Use the supported Claude Agent SDK integration | Claude Agent -> Claude harness | Anthropic API key or supported cloud-provider credential | Claude session |
| Use Cursor product behavior, configuration or entitlement | Cursor Agent -> Cursor harness | user's native Cursor account | Cursor session |
| Use the user's own OpenCode profile, Providers and configuration | OpenCode -> user OpenCode harness | user's OpenCode Provider configuration | user's OpenCode session |

The following rules are normative:

- First open is inventory-only. PuppyOne lists locally available Agent products
  and keeps `selectedRuntimeId`, selected readiness, Provider and Model empty
  until the user explicitly chooses a row. It never preselects Codex,
  PuppyOne Agent, or the registry's internal default.
- A version-2 preference written after an explicit picker action may restore
  that Agent on a later open. Legacy global runtime keys are not proof of user
  intent, and version 1 could contain an implicit controller default: migration
  may retain their backend-scoped model routes, but must not turn either into a
  selected Agent. A stale preference clears to the inventory-only state rather
  than falling back to another runtime.
- A row named after a native Agent product uses that product's documented
  native protocol or official SDK. It is never implemented as PuppyOne Agent
  calling a similarly named inference API.
- `OpenAI API` inside PuppyOne Agent is not Codex. `Anthropic API` inside
  PuppyOne Agent is not Claude Agent or Claude Code. An inference Provider is
  not an Agent product.
- `Agent` is reserved in shared UI for the top-level harness route. If an
  upstream runtime calls a persona/configuration an “agent,” the adapter and UI
  present it as `Profile` or `Mode` so it cannot be confused with this selector.
- Native product subscriptions and private CLI credential stores are never
  translated into PuppyOne Agent Provider credentials. BYO means an explicitly
  configured API key or enterprise Gateway accepted by that Provider, not a
  repurposed ChatGPT, Claude Pro/Max, Codex or Cursor subscription token.
- A native route is preferred when the user explicitly selects that native
  Agent or needs its product-specific loop, tools, configuration, login,
  entitlement or session semantics. PuppyOne Agent is preferred when the user
  selects PuppyOne's unified policy/tool experience or needs cross-provider
  model choice under one managed harness.
- An unavailable route stays unavailable. PuppyOne never silently falls back
  from a native Agent to PuppyOne Agent, or from PuppyOne Agent to a native
  Agent.
- The current Claude implementation is the `Claude Agent` SDK route. It is not
  a Claude Pro/Max subscription route. A future unmodified Claude Code native
  subscription integration must be a separately named route and pass its own
  supported-protocol, authentication, security and product-policy gates.

### Model switching and Agent switching

- PuppyOne Agent may change Provider/model at a turn boundary when its managed
  harness advertises compatibility. The session remains in PuppyOne Agent and
  every turn records the effective Provider/model in its live provenance.
- Native Agents may change model only through settings their own harness
  advertises. A native model choice never changes the harness owner.
- Changing Agent always creates a new native session. A handoff may contain an
  explicit, user-visible task summary, selected messages, workspace references
  or diff, but never hidden reasoning, credentials or a transplanted native
  session ID.

## 2. Product concepts

```text
Agent
  A selectable native coding product and harness route.
  Examples: Codex, Claude Agent, Cursor Agent, OpenCode, PuppyOne Agent.

Harness
  The native reasoning, tool, context, retry and continuation loop.

PuppyOne Managed Harness
  The first-party product boundary used only by PuppyOne Agent. PuppyOne owns
  its distribution, policy, Provider/model routing, profile isolation and
  support. Its current internal Agent-loop kernel is managed OpenCode.

Inference provider
  A billing/model route exposed inside an Agent when that Agent supports it.
  It is not an Agent and is never used as a runtime ID.

Model / effort / mode
  Backend-scoped native configuration. Values are not portable by assumption.

Live product session
  Process-local correlation between one window, workspace and native session.

Native session
  The selected harness's authoritative thread/session and history policy.
```

The picker hierarchy is therefore:

```text
Agent first
  Codex          -> Codex Model -> supported reasoning effort
  Claude Agent   -> Claude Model -> supported permission/mode options
  Cursor Agent   -> Cursor-native Model -> supported mode/permission options
  OpenCode       -> connected Provider -> Model -> Mode
  PuppyOne Agent -> connected Provider -> Model -> Mode
```

Changing Model inside a live native session uses the selected harness's native
configuration method when supported. Changing Agent creates a new session. It
does not translate or migrate the previous transcript.

## 3. Ports-and-adapters dependency model

```text
Renderer UI
  -> Renderer application/domain
  -> shared public Agent contract
  -> typed preload IPC
  -> Main IPC adapter
  -> Main application control plane
  -> AgentRuntimePort                         inward-facing interface
                ^
                |
  concrete native adapter                    implements the port
  -> protocol / transport / security floors
  -> native harness process or official SDK

Production composition root
  -> creates the application control plane
  -> registers concrete native adapters
  -> is the only module allowed to know both sides
```

Application code depends on ports and shared contracts, never on a concrete
provider. Concrete adapters depend inward on the runtime port and outward on
their protocol floor. Provider-neutral ACP, transport, cache and workspace
security code imports neither application orchestration nor concrete product
composition. The only production composition root is
`electron/main/agent/bootstrap/create-agent-runtime-host.mjs`.

## 4. Source layout

```text
shared/agent-contract/
  schema.mjs                         strict public IPC/event DTOs

electron/
  preload.cjs                        narrow Renderer bridge
  main.mjs                           app composition and cache paths
  main/agent/
    application/
      agent-service.mjs              trusted application facade
      agent-event-journal.mjs        bounded live delivery projection
      agent-runtime-catalog.mjs      lazy discovery and capability catalog
      processes/
        agent-process-supervisor.mjs bounded fair native-start gate
    runtime/
      agent-runtime-port.mjs         backend lifecycle interface
      agent-runtime-registry.mjs     backend-neutral registry
    cache/
      ephemeral-agent-session-cache.mjs
                                       process-local only; no Chat history
    persistence/
      agent-conversation-catalog.mjs  metadata/native-session pointers only
      agent-session-repository.mjs    memory replay + metadata catalog join
    infrastructure/attachments/
      agent-attachment-store.mjs      immutable private file staging
    connections/
      local-agent-inventory.mjs      sanitized TTL disk cache + explicit refresh
      probes/                         deterministic GUI-safe executable probes
    protocols/acp/
      acp-client.mjs                 method negotiation and callbacks
      acp-event-normalizer.mjs       ACP -> AgentEvent
      acp-runtime-adapter.mjs        provider-neutral ACP lifecycle core
      acp-session-config.mjs         model/mode/effort capability mapping
    transports/
      jsonl-rpc-connection.mjs       bounded process + JSON-RPC 2.0 framing
      managed-agent-process.mjs      process-group cleanup
    security/
      acp-workspace-files.mjs        canonical workspace file callbacks
      authorized-project-instructions.mjs
    runtimes/
      codex/                         native app-server adapter
      claude/                        Claude Agent SDK channel, spawn and discovery
      opencode-protocol/             shared ACP adapter
      opencode-native/               user OpenCode composition
      puppyone-agent/                managed OpenCode composition/integrity
      cursor/                        production Cursor ACP adapter/extensions
    bootstrap/
      create-agent-runtime-host.mjs  concrete production wiring

src/features/desktop-agent/
  lazy.ts                            public code-split renderer entrypoint
  application/                       controller, session preparer and client port
  domain/                            reducer/state/capability decisions
  infrastructure/electron/           typed Electron client adapter
  ui/                                composition and accessible components
  ui/styles/                         feature-local tokens and responsive rules

benchmarks/performance/
  agent-chat.bench.ts                product-critical UI performance budgets
```

Provider adapters may share a protocol floor, but they never import one
another's product composition. `opencode-native` and `puppyone-agent` reuse the
same ACP adapter while supplying different discovery, profile, provenance and
security policy.

## 5. Runtime route matrix

| Agent route | Native boundary | Harness owner | Auth/session owner | Distribution |
| --- | --- | --- | --- | --- |
| Codex | `codex app-server`, JSONL-RPC stdio | Codex | Codex | user installation |
| Claude Agent | official Agent SDK + Claude executable | Claude | Anthropic API key or supported cloud credential | SDK bundled, user CLI |
| OpenCode | ACP, JSON-RPC 2.0 stdio | OpenCode | user's OpenCode profile | user installation |
| PuppyOne Agent | managed contract; current kernel uses ACP stdio | PuppyOne managed boundary; OpenCode owns the current internal loop | PuppyOne managed profile or explicit API Provider | bundled and verified |
| Cursor Agent | official Cursor ACP (`agent acp`) | Cursor | user's Cursor account | user installation |

There is no implicit fallback. An unavailable route stays unavailable with a
bounded recovery diagnostic; another Agent is never selected on the user's
behalf.

## 6. Shared runtime contract

Every selectable definition supplies discovery and constructs one
workspace-bound adapter.

```text
AgentRuntimeDefinition
  descriptor
  discover({ refresh })
  createAdapter({ readiness, workspaceRoot, onEvent, onExit })

AgentRuntimePort
  inspect()
  createSession()
  resumeSession()             only when native capability exists
  readHistory()               may return no PuppyOne-owned history
  startTurn()
  interruptTurn()
  steerTurn()                only when negotiated
  resolveApproval()           only when supported
  resolveQuestion()           only when supported
  forkSession()               only when negotiated
  compactSession()            only when negotiated
  dispose()
```

The application layer consumes capabilities and public catalogs rather than
branching on IDs. Unsupported operations fail closed. New native products are
added through a runtime definition and adapter, not a switch statement in the
controller or UI.

Each inspection returns one effective capability snapshot: adapter support,
the native handshake and PuppyOne product/security policy are intersected at
the main-process boundary. The snapshot includes a bounded `revision`, native
`protocol` name/version/extension map and timing `constraints` such as
turn-boundary model switching or idle-only fork/compaction. Compatibility
booleans remain a UI projection, not a second capability authority. A runtime
cannot advertise an operation unless its adapter implements the corresponding
port method.

Reference input is also capability-driven. Workspace files, workspace
directories, staged images and generic staged files are distinct capabilities;
the legacy `attachments/contextReferences` booleans are not sufficient to
infer a native transport. The canonical reference model, external File grant
and draft/turn ownership rules are defined in
[Agent Composer reference ingestion](composer-reference-ingestion.md).

## 7. Provider-specific execution

### Codex

```text
initialize -> initialized
account/read + model/list
thread/start or thread/resume
turn/start
  <- native item/turn/tool/approval notifications
turn/interrupt
```

One live PuppyOne session maps to one Codex thread across follow-ups. Codex
owns its native tool loop and history. Model effort is taken from the native
catalog; legacy `max` is normalized to the supported `xhigh` value.

### Claude Agent

```text
deterministic executable discovery
  -> secure capability probe
  -> official Agent SDK query
       -> one persistent message channel across follow-ups
       <- streamed SDK messages / permissions / questions
```

Readiness is based on required protocol flags rather than a guessed minimum
version. Project-local Claude settings/hooks are not loaded implicitly;
authorized project instructions are supplied through PuppyOne's security
boundary. Permission bypass is forbidden.

### OpenCode and PuppyOne Agent

```text
ACP initialize
session/new or session/load
session/set_config_option / session/set_mode
session/prompt
  <- session/update
  <- session/request_permission
  <- fs/read_text_file / fs/write_text_file
session/cancel
```

The user route preserves the user's OpenCode profile. The managed route uses a
pinned executable, isolated profile and fail-closed overlay. Metadata
inspection uses a transient database so opening a picker does not create
durable conversation state.

Cursor uses the same provider-neutral ACP lifecycle core, adds `cursor_login`
authentication and keeps `cursor/*` extension requests inside the Cursor
adapter. OpenCode-specific process arguments, environment policy and managed
profile overlays stay in the OpenCode adapter rather than leaking into ACP.

## 8. Event and turn lifecycle

```text
Chat active + selected route ready
  -> Renderer controller starts one single-flight native-session preparation
  -> main validates window + workspace + selected native configuration
  -> create one empty native session/thread owned by the selected harness

User intent
  -> atomically capture prompt, configuration and draft references
  -> render optimistic local prompt and sanitized reference displays
  -> await that same preparation when it is still in flight
  -> start turn

Native stream
  -> turn.started authorizes the presentation-only Thinking state
  -> adapter schema/correlation validation
  -> normalized AgentEvent
  -> bounded application projection
  -> Renderer controller
  -> transcript/activity/blocking UI

Terminal state
  turn.completed | turn.failed | turn.interrupted
  -> resolve or cancel pending blocking requests
  -> keep native session for a valid follow-up
```

Process/runtime startup, account or model inspection, and native-session
creation are not model thinking. The UI exposes them as `Preparing <Agent>` only
after a prompt is pending, then uses `Starting turn` until the authoritative
`turn.started` event. Background preparation has no transcript row. This keeps
the first-turn latency honest while moving the reusable cold work ahead of the
first Submit. PuppyOne writes no Chat History: only bounded routing metadata
and the native session pointer are durable, while the selected harness remains
the sole owner of native thread/history content.

Native process starts share one fair, bounded supervisor so discovery cannot
create an unbounded spawn storm. JSONL runtimes launch in a POSIX process group
where available; graceful and forced shutdown target the full process tree.

Normalized events cover assistant text, safe working-state summaries, tool
activities, bounded command output, file changes, approval/question requests,
usage and terminal state. Hidden chain-of-thought is never reconstructed or
presented as if it were a user-facing native message.

Structured tool identity is lossless across this boundary. Adapters normalize
native names into stable presentation semantics such as `read`, `write`,
`edit`, `grep`, `glob`, `bash`, `websearch` and `mcp`, while retaining bounded
structured input. A Shell command remains a command for security and approval;
the Renderer may conservatively present recognized read-only commands as
`Grep`, `Glob`, or `Read` for scanability. The collapsed row omits provenance
noise while the exact command remains preserved in the disclosure and the
normalized security/audit state.

The normalizer preserves provider event ordering. Renderer updates are batched
and transcript mounting is bounded so streaming cannot monopolize the UI
thread or block the left Sidebar.

## 9. State and persistence

The storage rule is deliberately narrow:

```text
Disk
  yes  versioned per-runtime Agent/Provider/model/variant/effort/mode preference
  yes  sanitized Agent discovery snapshot with TTL
  yes  bounded Conversation Catalog metadata and native session pointers
  no   Chat transcript
  no   assistant/user messages
  no   tool output, diffs or hidden reasoning
  no   provider credentials or raw environment
  no   duplicate provider-native history

Memory for the current app process
  live product/native session correlation
  bounded normalized event projection
  pending turn and approval/question state
```

The metadata-only Conversation Catalog makes authoritative native sessions
discoverable and resumable after restart without storing prompts, responses or
tool events. The inventory cache prevents a repeated full executable scan every time Chat
opens. It is invalidated by its TTL, explicit Refresh and authoritative runtime
failure. A versioned, explicit Agent and model preference lets the next Chat
start with the previous choice; without that proof of intent Chat stays on the
installed-Agent picker. Neither cache is Chat history.

This full inventory belongs only to Agent Chat readiness. The Terminal selector
does not consume it: Terminal owns a separate filesystem-only executable
locator and defers account, model and protocol behavior to the Agent after it
starts. See
[Desktop Terminal Architecture](../desktop-terminal-architecture.md).

Terminal-native Hook/plugin telemetry is also a separate edge. It does not
reuse Chat runtime adapters or turn Terminal into a second Chat control plane.
Provider-specific Terminal adapters normalize into a neutral, live-only Agent
Activity broker that Editor/Explorer may consume through a sanitized presence
contract. A future Chat source may publish to the same neutral broker, but the
two source implementations remain independent. See
[Local Agents and Agent file activity](local-agents-and-file-activity.md).

## 10. Security invariants

```text
untrusted Renderer intent
  -> shared schema
  -> trusted window and active-workspace authorization
  -> canonical path and session correlation
  -> runtime adapter capability check
  -> native process
```

- no generic spawn, stdin, environment, URL, password or filesystem IPC;
- absolute canonical executable, `shell: false`, bounded output and cleanup;
- JSON-RPC frame, pending-request and diagnostic limits;
- no arbitrary timeout/retry for a mutating long-running prompt;
- workspace-only ACP file callbacks with symlink/traversal protection;
- raw paths outside the workspace are never forwarded as references;
- an external file may cross the boundary only through a real preload File
  grant, main-owned immutable staging and an owner/workspace-bound opaque token;
- Renderer events and logs never contain staging tokens, snapshot bytes/data
  URLs or external absolute source paths;
- approval replies require exact live request/turn/session ownership;
- no credential-store scraping or translation between native products;
- no automatic Agent fallback after auth, protocol or process failure;
- managed OpenCode project config, sharing, auto-update and implicit external
  code-bearing surfaces disabled;
- raw native payloads and secrets never cross into Renderer DTOs.

## 11. Discovery and caching

Discovery is lazy and does not run on file open, application startup or the
left Sidebar's scrolling path.

```text
Chat/picker first opens
  -> return valid sanitized cache immediately when present
  -> otherwise single-flight bounded scan
       deterministic candidate paths
       canonical executable identity
       version + required protocol capability probe
       sanitized readiness result

explicit Refresh
  -> bypass cache
  -> terminate/replace bounded probes
  -> write a new sanitized snapshot atomically with restrictive permissions
```

An installed binary is not necessarily selectable. The route also needs its
required native protocol and product-policy capabilities. This is why an old
Claude executable or OpenCode installation is described as detected but protocol
unavailable instead of incorrectly reported as missing.

## 12. Extensibility checklist

A new Agent route must add:

- a deterministic discovery descriptor and readiness states;
- a documented native protocol or official SDK;
- a session-scoped adapter with explicit capabilities;
- streaming, interruption, blocking-request and cleanup tests;
- credential/entitlement and workspace threat-model documentation;
- public event schema fixtures and diagnostic redaction;
- provenance and third-party notices when code or a binary is adopted;
- production registration only after all selection gates pass.

The UI remains unchanged for the common lifecycle. It exposes new controls only
when the runtime capability/catalog says they exist.

## 13. Architecture fitness and performance gates

The repository verifies these boundaries in CI and production builds:

```text
scripts/check-agent-architecture.mjs
  dependency direction / composition root / adapter size budgets

scripts/check-opencode-provenance.mjs
  pinned source, integrity, ACP transport and no stale SDK dependency

scripts/check-agent-ui-provenance.mjs
  adapted-source ledger and attribution

tests/desktop-agent.architecture.test.ts
  client port, safe Markdown, virtual transcript and no rendered diagrams

benchmarks/performance/agent-chat.bench.ts
  128 KiB Markdown
  64 KiB command output + 240-line diff
  500-model picker
  2,000-row transcript with bounded DOM
```

The backend is kept off the editor and left Sidebar critical path. Runtime
discovery is lazy, provider events are bounded, and the Renderer mounts only a
windowed transcript. These are product correctness requirements, not optional
micro-optimizations.

## 14. Related specifications

- [ADR-005: Multi-native Agent backends](ADR-005-multi-native-agent-backends.md)
- [ADR-006: Native harness adapters and ACP](ADR-006-native-harness-adapters-and-acp.md)
- [Native Agent discovery](local-agent-connection-discovery.md)
- [Right Sidebar Agent Chat](right-sidebar.md)
- [Chat UI behavior specification](chat-ui-behavior-spec.md)
- [Agent Composer reference ingestion](composer-reference-ingestion.md)
- [Managed Agent engine distribution](ADR-004-managed-agent-engine-distribution.md)
- [OpenCode upgrade runbook](opencode-upgrade-runbook.md)

## 15. Document authority and retirement

| Document | Status | Scope |
| --- | --- | --- |
| This README | current source of truth | complete system map, ownership, source layout and invariants |
| [ADR-006](ADR-006-native-harness-adapters-and-acp.md) | accepted and implemented | native harness routes, ACP boundary, persistence and security |
| [ADR-005](ADR-005-multi-native-agent-backends.md) | accepted and implemented | product vocabulary and multi-native product model |
| [ADR-002](ADR-002-agent-contract-and-boundaries.md) | accepted and implemented | shared contract and dependency boundaries |
| [Composer reference ingestion](composer-reference-ingestion.md) | implemented | workspace context, external staging, Composer UX, capability and transcript contract |
| [ADR-004](ADR-004-managed-agent-engine-distribution.md) | accepted, narrow scope | managed kernel distribution for PuppyOne Agent only |
| [ADR-001](ADR-001-opencode-sidecar.md) | retired | former HTTP/SSE sidecar choice; no longer an implementation option |
| [ADR-003](ADR-003-opencode-only-chat-harness.md) | retired | former single-OpenCode routing choice; no longer an implementation option |
| [OpenCode adoption spike](opencode-adoption-spike.md) | archived evidence | non-normative research pointer only |
| [Codex vertical slice](history/codex-vertical-slice.md) | archived history | first-slice delivery record; never current guidance |

Retired decisions are intentionally reduced to short tombstones. Their detailed
content remains available in Git history, but keeping obsolete executable
instructions in the current document set would create two competing
architectures.
