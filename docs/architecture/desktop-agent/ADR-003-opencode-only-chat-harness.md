# ADR-003: OpenCode is the only product Chat harness

Date: 2026-07-11. Status: superseded by
[ADR-005](ADR-005-multi-native-agent-backends.md) on 2026-07-12.

This file remains the historical record for the OpenCode-only phase. Its
single-harness product routing, hidden runtime selector and global OpenCode
availability rules are no longer the target architecture. Its OpenCode process
isolation, safe DTO, permission and provenance decisions continue under the
PuppyOne Agent backend through ADR-001 and ADR-004.

This decision supersedes the product-routing parts of ADR-001 and ADR-002 that
exposed OpenCode and Codex as peer, user-selectable Chat runtimes. It does not
supersede their process-isolation, typed-boundary, security or provenance
decisions.

## Decision

Every new PuppyOne right-sidebar Chat session runs on the pinned OpenCode
sidecar. OpenCode owns the agent loop. A model provider is selected inside that
harness; it is not a competing harness.

```text
PuppyOne right-sidebar Chat
        |
        v
PuppyOne product session
  workspace mapping, UI projection, preferences and bounded cache
        |
        v
OpenCode harness                         FIXED PRODUCT KERNEL
  loop, tools, prompts, permissions,
  MCP, skills, compaction and native session
        |
        v
Provider route                          USER/SESSION CHOICE
  +-- OpenAI / ChatGPT OAuth -> GPT and Codex models
  +-- Anthropic API          -> Claude models
  +-- Google / OpenRouter    -> advertised models
  +-- Modal or another OpenAI-compatible endpoint
  +-- future authorized Cursor/local-compute provider bridge
        |
        v
Model and model-scoped variant          USER/SESSION CHOICE
```

The normal Chat UI has no harness/runtime selector. It may expose provider,
model, model-scoped variant and OpenCode agent/mode controls when the current
catalog supports them.

If OpenCode is unavailable, unverified or unhealthy, Chat fails closed with a
repair diagnostic. It must not silently fall back to Codex app-server, Claude
Code, Cursor CLI or another agent loop.

## Vocabulary

These concepts must remain separate in code, copy and telemetry.

```text
Harness
  OpenCode only. Owns iterative reasoning, tool execution and native sessions.

Provider route
  Owns inference transport, authentication and billing. Examples include
  OpenAI, Anthropic, Google, OpenRouter and an authorized compatible endpoint.

Model
  A provider-scoped model identifier such as openai/<codex-model> or
  anthropic/<claude-model>.

Agent profile / mode
  OpenCode prompt, tools, permissions and behavioral configuration such as
  Build or Plan. It is not a harness.

Native session
  The OpenCode source of truth for messages, parts, tool state, compaction,
  fork ancestry and execution continuation.

Product session
  PuppyOne's mapping and presentation record for a native OpenCode session.
```

“Codex provider” in product language means an OpenAI/ChatGPT provider route and
a Codex-family model executed by OpenCode. `codex app-server` is itself an
agent harness, not a drop-in inference API, so nesting it behind OpenCode would
create two competing loops, permission systems, context windows and session
stores.

Cursor CLI and Claude Code are also agent products rather than automatically
valid model providers. They may appear in the provider layer only after a
supported, authorized inference bridge exists. The UI must not claim that a
local subscription is reusable merely because its product is installed. The
installation itself must still appear in a separate Local tools inventory with
version/auth/bridge status; hiding a detected tool and making it selectable are
both incorrect outcomes.

## Session ownership

OpenCode remains authoritative for the conversation and its execution state.
PuppyOne stores enough product state to find, present and safely recover that
native session, but does not create a second canonical conversation database.

```text
OpenCode native session                 AUTHORITATIVE EXECUTION RECORD
  session id
  messages and typed parts
  tool calls and results
  permission/question state
  compaction and fork lineage
             |
             | providerSessionId
             v
PuppyOne product session                PRODUCT INDEX + PROJECTION CACHE
  application session id
  canonical workspace mapping
  OpenCode version/profile identity
  selected provider/model/variant/mode
  title, archive state and timestamps
  bounded redacted AgentEvent journal
             |
             v
Renderer session UI                     EPHEMERAL PRESENTATION STATE
  draft and attachments
  projected turns/parts/rows
  expanded rows, scroll and measurements
```

The PuppyOne journal is a bounded replay and offline-presentation cache. On
resume, OpenCode native history wins if the cache is partial or disagrees with
the native session. Raw provider payloads, credentials and unbounded command
output are never persisted in the product session.

Deleting a PuppyOne mapping and deleting the OpenCode native session are
separate, explicit operations. Hiding or unmounting the sidebar changes neither
record and never terminates a turn.

## Process and security boundary

The accepted sidecar boundary remains unchanged.

```text
React
  -> typed preload IPC
  -> Electron main AgentService
  -> OpenCode AgentRuntimePort adapter
  -> authenticated loopback HTTP/SSE
  -> pinned OpenCode sidecar
  -> selected provider route
```

Electron main owns the sidecar executable, random loopback port, per-start
secret, canonical workspace, file/reference authorization and blocking-request
correlation. Renderer receives only bounded provider-neutral DTOs.

Provider credentials remain outside Renderer. A provider bridge may use an
OpenCode-supported OAuth flow, an API key held by the managed profile or a
future main-authorized credential broker. A credential source does not become
a harness and cannot bypass OpenCode's loop or PuppyOne's permission boundary.

## Product behavior

- Clicking Chat discovers and starts OpenCode only.
- New Session creates an OpenCode native session and a PuppyOne mapping.
- History lists OpenCode-backed product sessions for the workspace.
- The header shows the session title and status, not “Codex session” as a
  harness identity.
- The composer may show Provider, Model, Variant and Agent/Mode. It does not
  show Runtime or Harness.
- Selectable Provider availability comes from OpenCode `/provider.connected`,
  never from `/config/providers`, an executable-presence check, or an
  unverified model catalog. Executable discovery feeds only the Local tools
  inventory until an authorized bridge passes its own gate.
- Provider must be selected before Model; the Model must advertise text input,
  text output and tool calling for Agent Chat.
- Changing provider/model follows OpenCode's advertised per-turn or
  new-session semantics. A variant is valid only for its selected model.
- Provider authentication failure leaves the OpenCode session intact and shows
  a provider-specific recovery action.
- OpenCode failure disables Chat; there is no invisible harness substitution.

## Legacy Codex direct sessions

The existing `CodexAppServerAdapter` is a historical vertical slice and is not
part of the target product route.

During migration it may be retained behind an internal compatibility boundary
only to:

- read and identify existing v1/v2 Codex session mappings;
- show an explicit legacy-session notice;
- export or archive old presentation history;
- keep its protocol tests until the migration window closes.

It must not create a new right-sidebar product session, appear in the composer,
be selected as an automatic fallback or be described as a model provider. Once
the migration policy is complete, its production registration can be removed
without changing the Renderer or OpenCode session model.

## Contract implications

`AgentRuntimePort` remains useful as the Electron/OpenCode process seam and as
a fake-runtime test contract. Runtime neutrality does not imply product-level
harness choice. Production composition registers OpenCode for new Chat
sessions; test composition may inject a fake harness.

Provider and model discovery comes from the OpenCode catalog. Future provider
bridges extend that catalog or its authorized configuration surface; they do
not add another `AgentRuntimePort` implementation merely because they use a
different model or credential source.

Migration status:

1. completed: remove the Runtime selector from the composer;
2. completed: make OpenCode the sole new-session production route;
3. completed: represent provider selection separately in application state and
   scope every selectable model to that connected provider;
4. route OpenAI/ChatGPT OAuth and Codex models through OpenCode;
5. completed: stop product fallback to a ready direct CLI harness;
6. treat persisted Codex direct sessions as legacy records;
7. in progress: update remaining legacy copy and telemetry to the vocabulary;
8. completed: add a production-composition invariant proving even a persisted
   Codex preference resolves to the sole registered OpenCode harness.

## Consequences

Benefits:

- one loop, one permission system and one native session authority;
- provider/model choice cannot accidentally replace the harness;
- Chat behavior is consistent across OpenAI, Anthropic and compatible routes;
- OpenCode upgrades and provider additions remain separate review surfaces;
- PuppyOne avoids maintaining its own harness while retaining product-owned
  session UX, security and presentation.

Costs:

- OpenCode availability becomes mandatory for Chat;
- a local CLI subscription is not reusable until a legitimate provider bridge
  exists;
- legacy direct Codex sessions require an explicit migration policy;
- the current runtime selector and direct-runtime routing are out of compliance
  until the listed migration work lands.

## Rejected alternatives

```text
Peer OpenCode and Codex harness selector
  Rejected: provider choice changes the loop and splits session truth.

OpenCode -> codex app-server nesting
  Rejected: creates agent-inside-agent behavior and duplicate tool policy.

Silent fallback from OpenCode to a direct CLI
  Rejected: changes semantics without user consent and corrupts expectations.

PuppyOne-owned replacement harness
  Rejected for this product direction: harness maintenance remains upstream.
```
