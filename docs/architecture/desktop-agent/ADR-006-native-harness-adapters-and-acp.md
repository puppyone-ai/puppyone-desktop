# ADR-006: Native harness adapters and the ACP boundary

Date: 2026-07-13. Status: accepted and implemented. This is the authoritative
implementation decision for native harness routing; the canonical system map
is mirrored in the Desktop Agent architecture README.

This decision refines
[ADR-005](ADR-005-multi-native-agent-backends.md) and supersedes the transport
choice in [ADR-001](ADR-001-opencode-sidecar.md),
[ADR-003](ADR-003-opencode-only-chat-harness.md), and the former global
sidecar scope narrowed by
[ADR-004](ADR-004-managed-agent-engine-distribution.md).

## Decision

PuppyOne is a multi-harness desktop client. It owns the product control plane,
but it does not implement a universal agent loop. Every selectable Agent route
has exactly one native harness owner and one explicit protocol adapter.

<!-- agent-runtime-map:start -->
```text
One PuppyOne Chat UI / product control plane
  workspace authority / typed IPC / normalized events / approvals / lifecycle
        |
        v
AgentRuntimeRegistry                 one immutable route per live session
  |
  +-- Codex
  |     -> codex app-server (JSONL-RPC over stdio)
  |     -> Codex owns Agent loop, tools, login, models and thread
  |
  +-- Claude Code
  |     -> official Claude Agent SDK + user's Claude Code executable
  |     -> Claude owns Agent loop, tools, permissions and native session
  |
  +-- OpenCode
  |     -> Agent Client Protocol (JSON-RPC 2.0 over stdio)
  |     -> user's OpenCode executable, profile, auth and native session
  |
  +-- PuppyOne Agent
  |     -> the same provider-neutral ACP adapter
  |     -> PuppyOne-bundled and pinned OpenCode kernel
  |     -> isolated PuppyOne profile; OpenCode owns the Agent loop
  |
  +-- Cursor Agent
        -> discovery and diagnostics only
        -> not selectable until a supported native protocol and approval
           contract pass the production gates
```
<!-- agent-runtime-map:end -->

There is no harness nesting. Selecting Codex never means running Codex as a
model provider inside OpenCode. Selecting Claude Code never sends its private
credentials through PuppyOne Agent. `PuppyOne Agent` is the only route whose
kernel is a PuppyOne-managed OpenCode build.

## Why this is the stable boundary

The product needs consistent workspace safety, UI events and approvals. It
does not need to duplicate each vendor's reasoning loop, tool scheduler,
compaction policy, provider retry logic or native session semantics.

The boundary therefore separates two kinds of responsibility:

| PuppyOne control plane owns | Selected native harness owns |
| --- | --- |
| public Agent selection | reasoning and agent loop |
| canonical workspace root | tool scheduling and native tool semantics |
| typed IPC and bounded DTOs | native streaming protocol |
| normalized UI event vocabulary | native prompt and context policy |
| correlated approval/question replies | provider retry and usage semantics |
| process containment and cleanup | native authentication and billing |
| short-lived live UI projection | authoritative native session state |
| sanitized discovery cache | native history, when the product provides it |

Shared code may normalize an event, enforce a stricter workspace boundary, or
append an explicitly authorized project-instruction snapshot. It must not
replace the native system prompt, synthesize hidden reasoning, emulate missing
tool calls or silently fall back to another harness.

## Ports-and-adapters dependency direction

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

The source tree groups the concrete adapters at the edge while keeping the
reusable floors free of provider imports:

```text
electron/main/agent/
  application/                 product orchestration, no provider branches
  runtime/                     AgentRuntimePort and registry
  cache/                       bounded non-transcript process snapshots
  protocols/acp/               provider-neutral ACP client and normalization
  transports/                  bounded JSONL-RPC process framing
  security/                    canonical workspace and instruction policy
  connections/                 lazy, cached local executable inventory
  runtimes/
    codex/                     Codex app-server adapter
    claude/                    Agent SDK channel, discovery and spawn adapter
    opencode-protocol/         shared OpenCode ACP adapter
    opencode-native/           user-owned executable/profile composition
    puppyone-agent/            pinned managed kernel composition
    cursor/                    diagnostics until protocol acceptance
  bootstrap/                   the only production composition root
```

Dependency rules are enforced by `scripts/check-agent-architecture.mjs`:

- application and runtime contracts cannot import concrete providers;
- ACP, transport, cache and workspace-security floors cannot import runtime or
  application orchestration;
- concrete provider construction happens only in the composition root;
- adapter size budgets prevent protocols and application policy from growing
  into one unreviewable class.

This is a ports-and-adapters boundary, not a linear stack in which shared Core
imports provider Features. The control plane sees only `AgentRuntimePort`;
provider adapters point inward to that port and are injected at the composition
root.

## OpenCode routes use ACP, not an HTTP sidecar client

Both OpenCode-backed routes use Agent Client Protocol over the child process's
stdin/stdout. The shared client owns JSON-RPC framing, method negotiation,
capability discovery, server callbacks and event normalization. Each live
session owns its own ACP process and native session.

```text
OpenCodeAcpAdapter
  -> spawn absolute verified executable with shell=false
  -> initialize ACP
  -> session/new or session/load
  -> session/set_config_option / session/set_mode
  -> session/prompt
       <- session/update streaming notifications
       <- session/request_permission
       <- fs/read_text_file or fs/write_text_file
  -> session/cancel when interrupted
  -> bounded graceful/forced process disposal
```

Prompt requests deliberately have no arbitrary wall-clock timeout. A long
agent turn is a valid operation and progress is delivered as notifications.
Transport frame, startup, discovery and metadata operations remain bounded.
An ambiguous timed-out prompt must never be retried automatically because that
could duplicate file or command side effects.

The managed route adds:

- exact release and executable SHA-256 verification with current/previous
  slots;
- loopback-only internal server parameters used by the upstream ACP command;
- an isolated config/cache/state/home surface;
- project config, external skills, sharing, auto-update and implicit downloads
  disabled;
- fail-closed permission modes surfaced through PuppyOne approvals.

The user OpenCode route preserves the user's own profile and native session
authority. It never shares the managed profile or reclassifies a user session
as a PuppyOne Agent session.

## Claude Code route

The official Agent SDK is the control layer and the user's canonical Claude
Code executable is the native harness. A session keeps one SDK query/channel
alive across follow-up messages; PuppyOne does not restart the harness for
every turn.

Readiness is capability-based, not an arbitrary version comparison. Discovery
requires the CLI flags that the secure SDK launch depends on, including
streaming input/output, permission mode, and settings-source isolation. An old
CLI remains visible as installed but is non-selectable when those capabilities
are absent.

Only user settings are loaded. Repository-local Claude settings and hooks are
not executed implicitly; PuppyOne supplies its separately authorized project
instruction snapshot. Permission bypass is prohibited. Subscription OAuth is
not repurposed for a third-party client; the route accepts only credential
forms supported by Anthropic for this integration.

## Codex route

Codex uses the native `app-server` protocol. One Codex thread persists across
follow-up turns in the live session. Codex owns its loop, tools, approvals,
login, models and native thread state.

The adapter accepts only reasoning-effort values advertised by the native
model catalog. The historical UI value `max` is normalized to the supported
native value `xhigh`, preventing the invalid request that previously left a
thread in an error state.

## Session, history and cache policy

PuppyOne does not persist Chat transcripts or create a second history source.

```text
Persisted by PuppyOne
  selected Agent/model preference in Renderer preferences
  sanitized local-runtime inventory with TTL and explicit Refresh invalidation

Process-local only
  live product session correlation
  bounded normalized event projection needed by the open window
  native session ID needed to route the current process

Never written as PuppyOne Chat history
  user/assistant transcript
  hidden reasoning
  command output or diffs
  provider-native history copies
  credentials or raw environment
```

At app restart, the selected native product remains the UI preference and the
inventory cache avoids an immediate full disk/process scan. Conversation
recovery, when supported, belongs to the native product and requires an
explicit future product surface; PuppyOne does not infer it from its live
projection. Legacy `desktop-agent-sessions.json` data is deleted rather than
continued as a hidden transcript store.

Switching Agent is a hard session boundary. The UI may preserve the unsent
draft, but it creates a new native session and does not copy the old transcript
or native session ID across providers.

## Workspace and approval safety

- The trusted window binding supplies one canonical workspace root.
- ACP file callbacks reject traversal, paths outside the workspace, symlinks,
  non-regular files, binary text reads and files over 4 MiB.
- New parent directories are created segment by segment and checked after each
  operation; file descriptors use `O_NOFOLLOW` where the platform provides it.
- Context references outside the authorized workspace are not forwarded.
- Blocking replies correlate product session, native session, turn, tool and
  request IDs. Late or mismatched replies fail closed.
- Renderer never receives executable paths, environment maps, auth tokens, raw
  protocol frames or internal server addresses.
- Unsupported capabilities stay unavailable; adapters never simulate them.

## Adding another native Agent

A new route is acceptable only when it has all of the following:

1. a stable provider ID and descriptor;
2. deterministic, bounded and GUI-safe discovery;
3. a documented native protocol or official SDK;
4. a session-scoped `AgentRuntimePort` adapter;
5. event, approval, cancellation and process-cleanup mappings;
6. an explicit credential/entitlement policy;
7. workspace and attachment threat-model tests;
8. capability fixtures and failure isolation;
9. source/license provenance for adapted or bundled code;
10. registration in the single production composition root.

Until every gate passes, detection may appear in diagnostics but selection and
Send remain disabled. This is why Cursor is currently inventory-only.

## Rejected alternatives

```text
One OpenCode harness for every provider
  Rejected: changes native loop, permissions, billing and session ownership.

One PuppyOne-authored universal harness
  Rejected: duplicates mature vendor loops and makes PuppyOne responsible for
  model-specific tools, compaction and retry semantics.

UI-only shell command wrappers
  Rejected: no stable session, streaming, approval or cancellation contract.

Copying native credential stores
  Rejected: unsafe, unsupported and semantically different from using the
  user's native product.

Silent fallback to another Agent
  Rejected: can change cost and permissions without user consent.

Durable normalized transcript as a second history authority
  Rejected: drifts from provider state and violates the product's no-history
  ownership decision.
```

## Superseded architecture closeout

The following are no longer valid production paths:

- OpenCode HTTP/SSE sidecar transport;
- one mandatory OpenCode harness for every Chat route;
- direct CLI text scraping as a substitute for a native protocol;
- PuppyOne-owned durable transcript/session journals;
- automatic fallback from one Agent to another;
- treating Codex or Claude as inference providers inside PuppyOne Agent when
  the user selected their native Agent products.

ADR-001 and ADR-003 are retained only as short retired-decision tombstones.
Detailed obsolete instructions remain in Git history rather than in the active
architecture set.
