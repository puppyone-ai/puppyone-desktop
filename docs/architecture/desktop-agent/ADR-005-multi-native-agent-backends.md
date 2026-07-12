# ADR-005: PuppyOne unifies native Agent backends

Date: 2026-07-12. Status: accepted. Backend phases 1-4 and the backend portion
of phase 6 are implemented; Agent-first Renderer integration and optional
future backends remain incremental work.

This decision fully supersedes the product-routing decision in
[ADR-003](ADR-003-opencode-only-chat-harness.md). It narrows
[ADR-001](ADR-001-opencode-sidecar.md) and
[ADR-004](ADR-004-managed-agent-engine-distribution.md) to the managed
`puppyone-agent` backend. It reaffirms the multi-runtime contract and process
boundaries in [ADR-002](ADR-002-agent-contract-and-boundaries.md).
[ADR-006](ADR-006-native-harness-adapters-and-acp.md) is the authoritative
transport, persistence and source-layout refinement of this product decision.

## Context

PuppyOne is an Agent client and product control plane. It is not a universal
Agent loop. Users may already have a native Agent product, login, subscription,
history and permission model in Codex, Claude Code, Cursor Agent, OpenCode or a
future compatible product. Forcing all of those users through one OpenCode
harness would discard legitimate native behavior and make a bundled upstream
component a prerequisite for the entire Chat product.

PuppyOne also needs a first-party Agent experience that works without another
Agent product integration. That product is `PuppyOne Agent`. Its managed
implementation uses a pinned OpenCode harness, but OpenCode is an internal
kernel of that one backend rather than the global Chat architecture.

The product therefore needs one UI and one safety-conscious control plane over
multiple native harnesses. It does not need a PuppyOne-authored reasoning,
tool-dispatch or context-management loop.

## Decision

PuppyOne will expose multiple session-scoped Agent backends behind the existing
`AgentRuntimePort`. Each backend delegates execution to one native harness.
PuppyOne owns shared product concerns and normalization, not the harness loop.

```text
PuppyOne right-sidebar Chat
|
+-- shared product UI
|     live transcript, composer, approval/question docks
|
+-- PuppyOne application control plane
|     workspace authority, lifecycle, safe DTOs, event journal, projection
|
+-- AgentRuntimeRegistry                         SESSION-SCOPED CHOICE
      |
      +-- puppyone-agent
      |     managed, pinned OpenCode kernel
      |     PuppyOne profile, policy and provider routes
      |
      +-- codex
      |     user's Codex CLI login
      |     codex app-server over stdio JSON-RPC
      |
      +-- claude
      |     API-key or supported cloud-provider credentials
      |     Claude Agent SDK plus Claude Code executable
      |
      +-- cursor                                  CAPABILITY-GATED
      |     user's Cursor Agent
      |     enabled only after a stable supported protocol exists
      |
      +-- opencode-native
      |     user's OpenCode installation, profile and native sessions
      |
      +-- future native backend
            explicit adapter, capabilities and provenance
```

No backend wraps or invokes another backend's Agent loop. Selecting Codex does
not run Codex inside OpenCode. Selecting Claude Code does not translate Claude
credentials into an OpenCode provider. Selecting PuppyOne Agent uses the
managed OpenCode kernel directly and does not expose OpenCode as a second
session authority.

## Product vocabulary

The following terms are part of the contract and must not be used
interchangeably.

```text
Agent backend
  A user-selectable native Agent product integration. It owns one harness and
  its native session. Examples: PuppyOne Agent, Codex, Claude Code, OpenCode.

Harness
  The backend-native loop that owns iterative reasoning, tool dispatch,
  context management and continuation. PuppyOne does not implement this loop.

PuppyOne Agent
  PuppyOne's first-party Agent backend. Its internal harness kernel is managed
  OpenCode. The product name is PuppyOne Agent; attribution remains explicit
  in About, diagnostics, licenses and source provenance.

Inference provider
  A model transport and billing identity inside a backend when that backend
  exposes provider selection. OpenAI or Anthropic inside PuppyOne Agent is not
  an Agent backend.

Model and variant
  Backend-scoped model configuration. Model identifiers are never assumed to
  be portable across backends.

Native session
  The backend-owned thread/session that is authoritative for execution,
  history, tool state, compaction and continuation.

Product session
  A process-local, workspace-bound correlation pointing to one native session
  and one immutable backend identity. It is not durable Chat history.
```

## Ownership boundary

| PuppyOne owns | Native backend owns |
| --- | --- |
| Agent selection and readiness presentation | Agent loop and reasoning cycle |
| canonical workspace authorization | native tool scheduling and execution semantics |
| window/session/turn/request correlation | provider-specific prompts and context policy |
| normalized `AgentEvent` vocabulary | native streaming protocol and event source |
| bounded process-local event projection | canonical native session and full native history |
| live product/native session correlation | compaction, fork and resume semantics |
| shared transcript, composer and blocking docks | native model catalog and model options |
| capability-driven UI | native login, credentials and subscription entitlement |
| process lifetime, timeout and crash containment | provider retry and usage semantics |

PuppyOne may append a narrow, authorized workspace policy or project
instruction snapshot at the adapter boundary. It must not replace the native
system prompt, reconstruct the native tool loop or persist provider secrets.

## Backend contract

Every production backend is registered through the existing runtime registry
and implements the required `AgentRuntimePort` surface.

`Agent backend` is the product concept. `AgentRuntimeDefinition`,
`AgentRuntimeRegistry` and `AgentRuntimePort` remain the internal implementation
names. One registered production runtime definition represents exactly one
selectable backend; keeping the established internal names avoids a cosmetic
rename across shared contracts without weakening the product vocabulary.

```text
AgentRuntimeDefinition
  descriptor
    id, displayName, description, kind, iconKey, priority
  discovery
    executable/runtime source, version, authentication and compatibility
  createAdapter
    constructs one workspace- and session-bound native adapter

AgentRuntimePort
  inspect
  createSession
  resumeSession
  readHistory
  startTurn
  interruptTurn
  dispose

Capability-gated extensions
  steer
  queue
  fork
  compact
  approvals and structured questions
  attachments and context references
  provider/model/variant selection
  modes, commands, MCP and skills
```

The shared application and UI layers must not branch on concrete backend IDs.
They consume descriptors, readiness, capabilities, normalized events and
backend-scoped catalogs. Backend-specific protocol, prompt, history and
credential code remains under `electron/main/agent/runtimes/<backend>/`.

## Backend matrix

| Backend ID | User-facing name | Native transport | Authentication owner | Native session | Distribution | Target status |
| --- | --- | --- | --- | --- | --- | --- |
| `puppyone-agent` | PuppyOne Agent | ACP JSON-RPC 2.0 over stdio | managed OpenCode profile and supported provider flows | OpenCode session | bundled, pinned and verified by PuppyOne | implemented |
| `codex` | Codex | `codex app-server` stdio JSON-RPC | Codex CLI | Codex thread | user-installed CLI | implemented |
| `claude` | Claude Code | Claude Agent SDK plus user's Claude Code process | Anthropic API key or supported cloud provider | Claude session | SDK control layer bundled; user CLI required | implemented |
| `cursor` | Cursor Agent | supported native protocol, not shell scraping | Cursor | Cursor session | user-installed product | inventory-only until protocol gate passes |
| `opencode-native` | OpenCode | ACP JSON-RPC 2.0 over stdio | user OpenCode profile | OpenCode session | user-installed CLI | implemented |
| `pi` | Pi | `pi --mode rpc` | Pi/provider config | Pi session | user-installed CLI | optional future adapter |

An executable-presence check is never enough to enable a backend. A selectable
backend must pass installation, version, protocol, authentication, model/tool
capability, workspace and product-policy gates. Cursor remains visible as a
detected local tool while its execution protocol is unavailable.

## Selection and session semantics

The first composer choice is `Agent`, not an OpenCode inference provider.

```text
Agent
  PuppyOne Agent
  Codex
  Claude Code
  Cursor Agent          disabled with an explanation until supported
  OpenCode

Backend-scoped controls
  PuppyOne Agent  -> Provider -> Model -> Variant -> Agent/Mode
  Codex           -> Model -> Reasoning -> Sandbox/Approval profile
  Claude Code     -> Model -> Effort -> Permission mode
  OpenCode        -> Provider -> Model -> Agent/Mode
```

Choosing a different Agent for a blank composer changes the backend used by the
next new session. A created session pins `runtimeId` and `nativeSessionId`.
Changing Agent during an existing session creates a new session; it never
silently migrates or nests native state. Cross-backend fork, rewind or history
conversion is unsupported unless a future explicit export/import contract is
defined.

```text
PuppyOne product session
  sessionId
  workspaceRoot
  runtimeId                      immutable after creation
  nativeSessionId
  runtime version/provenance
  selected provider/model/variant/mode where supported
  bounded process-local AgentEvent projection
          |
          v
backend-native session           authoritative execution record
```

## Discovery and authentication

There are two related but separate catalogs.

```text
Agent backend inventory
  Which native Agent products are installed, compatible, authenticated and
  backed by a supported protocol?

Backend-scoped model/provider catalog
  Which providers, models, variants and modes can the selected backend use?
```

Native backend authentication remains native. PuppyOne may launch a documented
login flow or ask the user to complete the native product's login command. It
must not scrape, copy or translate private CLI credential stores. Discovery and
runtime processes stay in Electron main; Renderer receives bounded status and
action DTOs only.

Provider policy remains an additional gate. Anthropic's published policy does
not permit third-party products to route Agent SDK traffic through Free, Pro or
Max subscription OAuth credentials, so the Claude backend accepts an
Anthropic API key or supported cloud-provider credential and rejects
subscription-only OAuth. Native credentials are reused only where the native
product explicitly permits third-party clients.

PuppyOne Agent uses its managed profile and OpenCode-supported provider
authentication. A user's installed OpenCode backend uses a separate user-owned
profile. Those profiles, histories and credentials never merge implicitly.

## Security and process isolation

The shared security invariants from ADR-001 and ADR-002 remain mandatory for
every backend.

```text
React
  -> typed preload IPC
  -> Electron main AgentService
  -> AgentRuntimePort adapter
  -> native protocol/process boundary
  -> native harness
```

- Renderer never receives executable paths, environment dumps, internal URLs,
  passwords, tokens or raw native protocol payloads.
- Main canonicalizes the workspace and validates attachments and context
  references before the adapter sees them.
- Every blocking reply correlates window, product session, backend, native
  session, turn and request identity.
- Runtime processes use absolute validated executables, `shell: false`, bounded
  protocol frames, timeouts, redaction and graceful-to-forced shutdown.
- Adapter capability mappings fail closed. Unsupported approval, question,
  write, network or external-directory behavior cannot be silently promoted.
- One backend failure affects only sessions using that backend. It cannot
  disable unrelated native backends or trigger an invisible fallback.

## PuppyOne Agent and OpenCode provenance

`PuppyOne Agent` is the user-facing product name for the managed backend. Its
implementation remains an exact, verified OpenCode release behind the existing
main-only ACP adapter. PuppyOne owns distribution, profile isolation,
security overlays, upgrade qualification and product support. OpenCode owns the
native harness loop.

The implementation uses `puppyone-agent` as the product runtime ID. It must not
rewrite user-owned `opencode-native` session IDs into PuppyOne Agent sessions.
OpenCode licensing and source provenance remain visible outside the normal
conversation chrome.

ADR-004's bundling, integrity, rollback and repair rules apply only to
`puppyone-agent`. A corrupt or missing managed OpenCode component disables
PuppyOne Agent, not Codex, Claude Code or another healthy native backend.

## Migration from OpenCode-only composition

The migration is incremental and preserves existing sessions.

```text
Phase 0  Decision and vocabulary
  accept ADR-005; mark ADR-003 superseded; update product documentation

Phase 1  Multi-backend composition                         IMPLEMENTED
  keep AgentRuntimePort/Registry/Service
  register all production-ready definitions
  remove automatic selection of one global harness

Phase 2  PuppyOne Agent identity                           IMPLEMENTED
  rename the current managed product route to puppyone-agent
  remove the legacy PuppyOne-owned transcript cache
  keep managed OpenCode provenance in diagnostics and licenses

Phase 3  Native Codex                                      IMPLEMENTED
  promote the existing app-server adapter from legacy compatibility
  complete readiness, auth, capability, native-session and security tests

Phase 4  Native Claude Code                                IMPLEMENTED
  add CLI resolution, Agent SDK adapter, event normalization,
  permissions and capability tests

Phase 5  Agent-first UI                                    IN PROGRESS
  Agent selector before backend-scoped Model controls
  pin Agent identity per session and make switching create a new session

Phase 6  Optional backends                                 PARTIAL
  user OpenCode profile implemented; Pi remains optional
  Cursor only after a supported protocol and approval contract exist

Phase 7  Legacy closeout
  remove OpenCode-only branches, copy, tests and migration aliases after the
  supported session-retention window
```

Legacy PuppyOne transcript/session cache data is removed. Native provider
history is not copied or reclassified; a live session continues only through
its selected harness and the current application process.

## Architecture fitness rules

The following constraints must be executable checks, not documentation-only
intent. They are migration acceptance rules: each implementation phase must
add or invert the relevant check in the same change. Existing single-backend
checks remain truthful until the corresponding production composition and UI
phase lands; they are then removed rather than retained as contradictory
legacy policy.

- The production composition contains at least one backend and may contain
  multiple definitions; it must not hardcode a universal OpenCode selection.
- `AgentService`, shared domain, application and UI code do not name concrete
  backends for lifecycle behavior.
- Each backend has discovery, protocol, event-normalization, capability,
  security and cleanup contract tests.
- A session cannot change `runtimeId` after creation.
- An unavailable backend stays visible with a bounded diagnostic but cannot be
  selected or silently replaced.
- Backend-scoped models cannot be selected under another backend.
- The Agent selector precedes backend-scoped Provider and Model controls.
- A PuppyOne Agent engine failure does not prevent discovery or use of another
  healthy native backend.
- No test or production helper treats an inference provider, model, CLI and
  harness as the same identifier.

## Consequences

Benefits:

- users can reuse supported native Agent products, permitted credentials and
  session behavior without credential scraping;
- PuppyOne maintains one product control plane and UI rather than an Agent
  loop;
- PuppyOne Agent remains a coherent first-party default without becoming a
  mandatory kernel;
- native harness upgrades and capability differences remain isolated behind
  adapters;
- one backend can fail or be absent without disabling all Chat functionality.

Costs:

- each native protocol requires its own adapter, capability baseline and
  security review;
- behavior cannot be perfectly identical across backends, so capability-driven
  UX and testing are mandatory;
- session migration and support diagnostics become backend-aware;
- user-installed backends introduce version and login-state support surfaces.

## Rejected alternatives

```text
One mandatory OpenCode harness for every Agent
  Rejected: blocks direct use of native Agent products and makes one upstream
  component the availability authority for all Chat.

PuppyOne-authored universal Agent loop
  Rejected: duplicates mature harness behavior and makes PuppyOne responsible
  for tool scheduling, context, compaction and model-specific semantics.

UI-only integration with no common control plane
  Rejected: cannot enforce workspace ownership, safe IPC, event bounds,
  session recovery or correlated approvals consistently.

Credential scraping to turn native products into model providers
  Rejected: unsafe, unsupported and semantically incorrect. Native products
  connect through their supported harness protocols.

Silent fallback between backends
  Rejected: changes loop, permissions, billing and native session ownership
  without user consent.
```

## Implementation specifications

- [Desktop Agent architecture and target source layout](README.md)
- [Native harness adapters and ACP](ADR-006-native-harness-adapters-and-acp.md)
- [Native Agent backend and model discovery](local-agent-connection-discovery.md)
- [Right Sidebar Agent Chat](right-sidebar.md)
- [Cursor-style Agent Chat UI behavior](chat-ui-behavior-spec.md)
