# Desktop Agent architecture

Status: production backend architecture implemented. The UI consumes the same
backend-neutral contract and may evolve independently.

PuppyOne Desktop provides one right-sidebar Chat over multiple native coding
Agents. It is a client and safety-conscious control plane, not a universal
agent harness. Codex, Claude Code and user OpenCode keep their own loops;
PuppyOne Agent uses a managed OpenCode kernel behind the same runtime contract.

The accepted decision is
[ADR-006: Native harness adapters and ACP](ADR-006-native-harness-adapters-and-acp.md).
[ADR-005](ADR-005-multi-native-agent-backends.md) defines the product model.

## 1. System map

```text
PuppyOne Desktop window
|
+-- left workspace surfaces
|     Data / Files / Git / Cloud / Settings
|
+-- center document surface
|     file router -> format-specific editor or viewer
|
+-- right Agent Chat
      |
      +-- Renderer feature
      |     header / transcript / activities / blocking docks / composer
      |
      +-- typed preload IPC
      |     narrow commands and sanitized events only
      |
      +-- Electron main application control plane
      |     workspace authorization
      |     runtime selection and live session lifecycle
      |     bounded normalized event projection
      |     correlated approvals and questions
      |
      +-- runtime registry                         one route per session
            |
            +-- Codex
            |     codex app-server -> Codex harness and thread
            |
            +-- Claude Code
            |     official Agent SDK -> Claude Code harness and session
            |
            +-- OpenCode
            |     ACP -> user's OpenCode harness/profile/session
            |
            +-- PuppyOne Agent
            |     ACP -> bundled pinned OpenCode harness
            |            isolated PuppyOne profile/session
            |
            +-- Cursor Agent
                  detection only until its native protocol is accepted
```

The Chat surface never contains a hidden OpenCode requirement. If the user
selects Codex, the native Codex harness owns the whole loop. If the user selects
Claude Code, the native Claude harness owns it. OpenCode is the internal kernel
only for PuppyOne Agent and the explicit user OpenCode route.

## 2. Product concepts

```text
Agent
  A selectable native coding product and harness route.
  Examples: Codex, Claude Code, OpenCode, PuppyOne Agent.

Harness
  The native reasoning, tool, context, retry and continuation loop.

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
  Claude Code    -> Claude Model -> supported permission/mode options
  OpenCode       -> connected Provider -> Model -> Mode
  PuppyOne Agent -> connected Provider -> Model -> Mode
```

Changing Model inside a live native session uses the selected harness's native
configuration method when supported. Changing Agent creates a new session. It
does not translate or migrate the previous transcript.

## 3. Layer model

```text
Layer A  Presentation
         src/features/desktop-agent/ui
         renders state and sends typed user intent
              |
Layer B  Renderer application/domain
         AgentSessionController + AgentClientPort
         provider-neutral transitions and capability-driven behavior
              |
Layer C  Shared contract and preload
         shared/agent-contract + electron/preload.cjs
         schema validation in both directions
              |
Layer D  Main application
         AgentService + RuntimeCatalog + EventJournal
         trusted workspace/session/request coordination
              |
Layer E  Runtime port and registry
         provider-neutral lifecycle contract
              |
Layer F  Protocol/security/transport floors
         ACP / JSONL-RPC / workspace files / bounded caches
              |
Layer G  Concrete native adapters
         Codex / Claude / OpenCode / PuppyOne Agent / Cursor diagnostics
              |
Layer H  Native harness process or official SDK
```

Allowed dependency direction follows the arrows. A lower shared floor does not
import the application control plane, and application code does not import a
concrete provider. The only production composition root is
`electron/main/agent/bootstrap/create-agent-runtime-host.mjs`.

## 4. Source layout

```text
shared/agent-contract/
  schema.mjs                         strict public IPC/event DTOs

electron/
  preload.cjs                        narrow Renderer bridge
  main.mjs                           app composition and cache paths
  main/agent/
    agent-service.mjs                trusted application facade
    application/
      agent-event-journal.mjs        bounded live delivery projection
      agent-runtime-catalog.mjs      lazy discovery and capability catalog
    runtime/
      agent-runtime-port.mjs         backend lifecycle interface
      agent-runtime-registry.mjs     backend-neutral registry
    cache/
      ephemeral-agent-session-cache.mjs
                                       process-local only; no Chat history
    connections/
      local-agent-inventory.mjs      sanitized TTL disk cache + explicit refresh
      probes/                         deterministic GUI-safe executable probes
    protocols/acp/
      acp-client.mjs                 method negotiation and callbacks
      acp-event-normalizer.mjs       ACP -> AgentEvent
      acp-session-config.mjs         model/mode/effort capability mapping
    transports/
      jsonl-rpc-connection.mjs       bounded process + JSON-RPC 2.0 framing
    security/
      acp-workspace-files.mjs        canonical workspace file callbacks
      authorized-project-instructions.mjs
    runtimes/
      codex/                         native app-server adapter
      claude/                        SDK channel, spawn and discovery
      opencode-protocol/             shared ACP adapter
      opencode-native/               user OpenCode composition
      puppyone-agent/                managed OpenCode composition/integrity
      cursor/                        inventory and compatibility diagnostics
    bootstrap/
      create-agent-runtime-host.mjs  concrete production wiring

src/features/desktop-agent/
  application/                       controller and client port
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
| Claude Code | official Agent SDK + Claude executable | Claude Code | Claude/Anthropic-supported credential route | SDK bundled, user CLI |
| OpenCode | ACP, JSON-RPC 2.0 stdio | OpenCode | user's OpenCode profile | user installation |
| PuppyOne Agent | ACP, JSON-RPC 2.0 stdio | pinned OpenCode kernel | isolated PuppyOne Agent profile | bundled and verified |
| Cursor Agent | no production protocol yet | Cursor | Cursor | diagnostics only |

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
  resolveApproval()           only when supported
  resolveQuestion()           only when supported
  dispose()
```

The application layer consumes capabilities and public catalogs rather than
branching on IDs. Unsupported operations fail closed. New native products are
added through a runtime definition and adapter, not a switch statement in the
controller or UI.

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

### Claude Code

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

## 8. Event and turn lifecycle

```text
User intent
  -> validate window + workspace + session + selected native configuration
  -> create or reuse one native session
  -> start turn

Native stream
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

Normalized events cover assistant text, safe working-state summaries, tool
activities, bounded command output, file changes, approval/question requests,
usage and terminal state. Hidden chain-of-thought is never reconstructed or
presented as if it were a user-facing native message.

The normalizer preserves provider event ordering. Renderer updates are batched
and transcript mounting is bounded so streaming cannot monopolize the UI
thread or block the left Sidebar.

## 9. State and persistence

The storage rule is deliberately narrow:

```text
Disk
  yes  selected Agent/model preference
  yes  sanitized Agent discovery snapshot with TTL
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

The inventory cache prevents a repeated full executable scan every time Chat
opens. It is invalidated by its TTL, explicit Refresh and authoritative runtime
failure. Agent and model preference lets the next Chat start with the previous
choice. Neither cache is Chat history.

## 10. Security invariants

```text
untrusted Renderer intent
  -> shared schema
  -> trusted window/workspace binding
  -> canonical path and session correlation
  -> runtime adapter capability check
  -> native process
```

- no generic spawn, stdin, environment, URL, password or filesystem IPC;
- absolute canonical executable, `shell: false`, bounded output and cleanup;
- JSON-RPC frame, pending-request and diagnostic limits;
- no arbitrary timeout/retry for a mutating long-running prompt;
- workspace-only ACP file callbacks with symlink/traversal protection;
- references outside the workspace are not forwarded;
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
Claude Code or OpenCode installation is described as detected but protocol
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
- [Managed Agent engine distribution](ADR-004-managed-agent-engine-distribution.md)
- [OpenCode upgrade runbook](opencode-upgrade-runbook.md)

ADR-001 and ADR-003 remain as historical context only. Their former mandatory
HTTP sidecar and OpenCode-only product routing are superseded by ADR-005 and
ADR-006.
