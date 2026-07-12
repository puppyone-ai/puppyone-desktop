# Native Agent backend and model discovery

Status: backend boundary implemented from
[ADR-005](ADR-005-multi-native-agent-backends.md). PuppyOne Agent, Codex,
Claude Code, user OpenCode and capability-gated Cursor are registered in the
production runtime catalog. Agent-first presentation remains a separate UI
migration.

This document defines how PuppyOne discovers native Agent products without
confusing an executable, harness, inference provider or model. It also defines
when an installed product becomes a selectable Agent backend.

## 1. Two discovery layers

PuppyOne needs two catalogs because they answer different questions.

```text
Agent backend inventory
  Which native Agent products can PuppyOne safely run on this machine?

Backend-scoped catalog
  Which providers, models, variants, modes and commands can the selected
  native Agent use?
```

```text
Agent backend inventory
-----------------------
PuppyOne Agent engine verified
Codex CLI installed and signed in
Claude Code installed and signed in
Cursor Agent installed, protocol unavailable
user OpenCode installed and signed in
          |
          | installation / version / auth / protocol / policy gates
          v
Selectable Agent backends
          |
          +-- PuppyOne Agent -> OpenCode connected Provider/Model catalog
          +-- Codex          -> Codex model/list and native capabilities
          +-- Claude Code    -> Claude SDK/native model and mode metadata
          +-- OpenCode       -> user OpenCode Provider/Model catalog
          +-- Cursor         -> no catalog until protocol gate passes
```

One catalog never substitutes for the other. A Codex executable is not an
OpenCode inference Provider. An OpenAI Provider route inside PuppyOne Agent is
not proof that Codex CLI is installed. A model ID is never used as a backend
ID.

## 2. Vocabulary

```text
Local installation
  A canonical executable or application bundle found on the machine.

Agent backend
  A user-selectable native Agent integration that owns one harness and native
  session. Examples: PuppyOne Agent, Codex, Claude Code and user OpenCode.

Harness
  The selected backend's native reasoning/tool/context loop.

Inference provider
  A backend-scoped model transport and billing identity when exposed by that
  backend.

Native protocol
  The supported interface used by an adapter: Codex app-server, Claude Agent
  SDK, OpenCode server/ACP, Pi RPC or a future Cursor contract.

Selectable
  Every installation, version, authentication, protocol, capability,
  workspace and product-policy gate has passed.
```

Do not use `Provider`, `Agent`, `CLI`, `model` and `harness` as interchangeable
labels in code, UI, telemetry or documentation.

## 3. Discovery result model

Installation, authentication, protocol compatibility and integration are
orthogonal. A single `available` boolean loses the recovery reason.

```text
AgentBackendReadiness
  id                    puppyone-agent | codex | claude | cursor |
                        opencode-native | future stable id
  displayName           bounded user-facing label
  installation          not-found | detected | unsupported | broken | managed
  version               bounded normalized version or null
  authentication        unknown | signed-out | signed-in | expired | error |
                        managed
  protocol              unsupported | compatible | incompatible | error
  capabilities          bounded native capability snapshot
  catalogState          idle | loading | ready | empty | error
  selectable            derived, never assigned independently
  statusMessage         exact bounded recovery reason
  actions               refresh | sign-in | repair | update | learn-more
  source                managed | configured | user | system | application
```

The currently implemented `LocalAgentConnection` DTO is an interim inventory
projection. Migration should either evolve it into the readiness contract above
or add a separate `AgentBackendReadiness` DTO while retaining a small Local
tools diagnostics view.

Executable paths, account identifiers, tokens, raw status output, credential
locations, sidecar URLs and process environment remain main-process data.
Renderer receives sanitized descriptors, status and action IDs only.

`selectable` is true only when every applicable gate passes:

```text
installation recognized
  AND tested version
  AND native protocol compatible
  AND native authentication ready
  AND required text/tool capabilities advertised
  AND canonical workspace accepted
  AND backend-specific product policy accepted
```

PuppyOne Agent uses `managed` installation/auth states and still requires a
verified engine plus at least one usable connected Provider/Model route.

## 4. Discovery lifecycle

- Do not scan user CLIs on application startup, file open or the left Sidebar
  critical path.
- Start a bounded scan when Chat first opens, the Agent picker opens, Agent
  settings open or the user presses Refresh.
- Managed PuppyOne Agent integrity may be checked independently and lazily when
  its row or an existing PuppyOne Agent session needs it.
- Cache sanitized readiness for at most five minutes. Invalidate on explicit
  Refresh, executable identity change, native process restart, login/logout or
  authoritative authentication rejection.
- Deduplicate concurrent scans. Application disposal aborts active probes and
  every timeout/output-limit path kills its child process.
- One backend failure never hides, disables or selects another backend.
- Restoring a saved session inspects its pinned backend. It does not choose the
  highest-priority healthy backend as a fallback.

## 5. Executable discovery

Packaged GUI applications often receive a smaller `PATH` than interactive
shells. Searching only `process.env.PATH` is insufficient, while starting a
login shell is slow and executes user-controlled startup code. Use a bounded,
deterministic candidate registry.

### Candidate sources

```text
1. Explicit per-device configured absolute path
2. Current non-login process PATH
3. Product-specific user locations
     ~/.local/bin
     ~/.npm-global/bin
     ~/.bun/bin
     ~/.cargo/bin where applicable
4. Platform package-manager locations
     /opt/homebrew/bin
     /usr/local/bin
5. Documented application bundle helpers
6. Provider-specific locations with explicit fixtures
     Claude local/npm/NVM/Volta/asdf entrypoints
     Codex.app resource locations
```

The list is platform-specific, bounded and tested. It is not a recursive home
scan. Each product is a validated descriptor with an ID, display name,
candidate aliases, probe and recovery copy. Inventory orchestration contains no
product-ID branches.

### Canonical candidates

| Backend | Candidates | Notes |
| --- | --- | --- |
| Codex | `codex` and documented Codex.app helpers | Require bounded version and app-server probes. |
| Claude Code | `claude`, native binary and documented Node package entrypoints | Resolve Node only when the entrypoint requires it. |
| Cursor Agent | `cursor-agent`, `agent`, documented Cursor helper | `cursor` alone may be an IDE launcher; classify before use. |
| user OpenCode | `opencode` | Keep user profile and data roots separate from PuppyOne Agent. |
| Pi | `pi` | Enable only with an approved RPC adapter. |

### File and process safety

- Resolve with `realpath`, require a regular executable file and retain a
  canonical identity/fingerprint through launch.
- Spawn directly with an argument array, an allowlisted environment and
  `shell: false`.
- Version and status probes have explicit time, output, line and pending-RPC
  limits plus graceful-to-forced cleanup.
- Reject directories, devices, relative paths, newline/NUL paths and candidates
  that change identity between validation and spawn.
- Diagnostic logs contain backend ID, safe source class, duration and outcome;
  never home paths, account output or environment values.

## 6. Codex readiness

Codex uses its public app-server interface. The existing PuppyOne bounded
JSONL-RPC transport and adapter are the foundation for the native backend.

```text
Level 1  canonical Codex executable + supported version
Level 2  app-server initialize / initialized handshake
Level 3  account/read authentication state
Level 4  model/list and required capability check
Level 5  production security/history/approval contract accepted
Level 6  selectable Codex backend
```

Rules:

- Level 1 is enough to show `Codex - Detected`.
- Levels 2-4 run lazily over stdio JSON-RPC with strict schemas and bounded
  output. Do not read or copy `~/.codex` credential files.
- `account/read` determines native authentication. `model/list` determines
  native model metadata; static production model lists are not authoritative.
- The backend uses `thread/start`, `thread/resume`, `turn/start`, native
  notifications and native approval/question requests.
- A Codex session stores its Codex thread ID. It never creates an OpenCode
  session or imports Codex credentials into PuppyOne Agent.
- The production adapter is selectable only after version, app-server,
  authentication and model inspection pass; capability, history, crash,
  cancellation and security behavior are covered by backend contract tests.

Reference: [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server),
including the stable stdio JSONL transport and native thread, turn, account,
model, approval and event surfaces. Experimental WebSocket transport is not
part of the PuppyOne production adapter contract.

## 7. Claude Code readiness

Claude Code uses the official Claude Agent SDK and the user's native Claude
Code installation. PuppyOne bundles the pinned SDK control layer but excludes
its 200+ MB optional platform executable from the base application; the native
backend passes the user's canonical Claude Code executable to the SDK. SDK
`0.3.159` is validated against Claude Code `2.1.159`; older local CLIs stay
visible as installed but are not selectable until they meet that tested
protocol baseline.

```text
Level 1  pinned Claude Agent SDK control layer available
Level 2  canonical user Claude executable + version
Level 3  SDK initialization/native session handshake
Level 4  native authentication and model/capability inspection
Level 5  permission/history/recovery contract accepted
Level 6  selectable Claude Code backend
```

Optional user-CLI resolution uses bounded deterministic categories:

- explicit per-device path;
- `~/.claude/local`, `~/.local/bin`, Homebrew and system locations;
- Volta, asdf and NVM default bins;
- documented `@anthropic-ai/claude-code` Node entrypoints;
- configured provider environment PATH.

The version probe runs with an OS-created temporary `CLAUDE_CONFIG_DIR`, then
deletes it. This prevents a read-only `--version` check from reading, migrating
or writing the user's real Claude profile. The resulting session environment
still uses the user's configured profile; probe isolation is never persisted
into runtime readiness.

PuppyOne passes the resolved user executable to the SDK. Claude Code remains the
owner of its loop, tools, permission semantics and native session. PuppyOne
normalizes SDK events and blocking requests but never polls or copies private
credential files.

The adapter loads user settings only. Repository project/local settings are
not executed implicitly; main instead loads one canonical, bounded project
instruction snapshot. The native `claude_code` system-prompt preset remains
authoritative, permission bypass is never enabled, and “allow for session”
filters permission updates to the SDK's in-memory `session` destination.

## 8. Cursor Agent readiness

Cursor remains capability-gated. Installation and authentication inventory may
be shown before execution support exists.

```text
Level 1  canonical Cursor Agent executable + version
Level 2  bounded native status/auth observation
Level 3  stable documented streaming/session/approval protocol
Level 4  explicit credential and billing contract
Level 5  production security/history/recovery adapter accepted
Level 6  selectable Cursor backend
```

Rules:

- Alias candidates resolving to the same canonical binary produce one row.
- Raw status output is reduced in main to a bounded auth state.
- Local CLI login and an SDK/API-key product are different entitlement
  contracts unless Cursor explicitly guarantees reuse.
- `--force`, unbounded shell output and simulated tool/approval semantics are
  prohibited.
- Until Levels 3-5 pass, Cursor is visible as `Detected - protocol not yet
  supported` and is not selectable.

## 9. PuppyOne Agent and user OpenCode

These are separate backends even though both use OpenCode technology.

```text
PuppyOne Agent
  runtimeId             puppyone-agent
  executable            pinned and verified PuppyOne component
  profile               PuppyOne-owned isolated profile
  provider catalog      managed OpenCode connected routes
  native sessions       managed OpenCode sessions
  repair                PuppyOne application repair/update

OpenCode
  runtimeId             opencode-native
  executable            user installation
  profile               user-owned OpenCode profile
  provider catalog      user OpenCode connected routes
  native sessions       user OpenCode sessions
  repair                native installation/login guidance
```

The two adapters never share implicit config roots, native session IDs or
credential stores. Existing product `opencode` mappings migrate to
`puppyone-agent`; they are not reclassified as user OpenCode.

For either OpenCode-backed backend, configuration catalog entries are not Send
authority. Only connected Providers with compatible text input, text output and
tool calling models survive capability filtering. An authoritative auth
rejection quarantines the affected route for that backend's current snapshot.

## 10. Agent picker presentation

The compact picker presents Agent backends, not a merged list of unrelated
Providers and local tools.

```text
+ Agent ---------------------------------------------------+
| Ready                                                     |
|  * PuppyOne Agent        Managed             Ready        |
|    Codex                 Native login        Ready        |
|    Claude Code           API/cloud auth      Ready        |
|                                                           |
| Detected                                                  |
|    Cursor Agent          Protocol unavailable Learn why  |
|    OpenCode              Sign in required       Sign in   |
|                                                           |
| [Refresh]                              [Agent settings]   |
+-----------------------------------------------------------+
```

- Ready backends appear before detected/non-ready entries.
- Non-ready rows remain focusable and explain the exact missing gate.
- Not-installed backends may be omitted from the compact picker but remain in
  the Connections/Agent settings page.
- Selecting a ready Agent on a blank composer loads only that backend's model,
  provider, variant and mode controls.
- An existing session shows its pinned Agent. Selecting a different Agent
  starts a new session after an explicit boundary confirmation.
- PuppyOne Agent may show Provider then Model. Native Codex or Claude Code may
  show Model directly when their native protocol has no separate Provider
  control.

## 11. Main/Renderer boundary

```text
Renderer
  open Agent picker / refresh / select public backend ID
        |
        v
typed preload IPC
        |
        v
Electron main
  AgentRuntimeRegistry
    definition discovery -> readiness -> capability/catalog inspection

  Local executable inventory
    candidate registry -> realpath -> version -> auth/protocol probe

  AgentService
    validate backend/model/session/workspace -> create native adapter
```

Renderer never receives generic spawn, command arguments, raw stdout,
environment variables, executable/credential paths, auth tokens, sidecar URLs
or passwords. Each backend has a specific discovery and protocol adapter plus
contract fixtures.

Target source boundaries:

```text
electron/main/agent/runtime/
  AgentRuntimePort / Registry             provider-neutral contracts

electron/main/agent/runtimes/<backend>/
  discovery, native protocol, normalization, history and security mapping

electron/main/agent/connections/
  bounded local executable inventory and reusable candidate/probe safety

shared/agent-contract/
  backend readiness, capabilities, catalogs and strict sanitized DTOs

src/features/desktop-agent/
  application/                            backend-neutral controller
  domain/                                 Agent -> scoped routing policy
  ui/AgentBackendPicker.tsx               accessible Agent selector
  ui/AgentProviderPicker.tsx              optional backend-scoped Provider
  ui/AgentModelPicker.tsx                 backend-scoped Model
```

The inventory layer must not import React or native runtime payloads. Runtime
adapters may reuse executable safety primitives but own protocol and session
semantics.

## 12. Refresh and failure behavior

| Failure | UI result |
| --- | --- |
| executable not found | omit from compact picker or show Not installed in Agent settings |
| probe timeout/broken binary | show scoped probe failure and Retry |
| unsupported version | show version range and Update/Learn action |
| signed out/expired | show native Sign in guidance and Refresh |
| protocol incompatible | keep Detected, disable selection and explain compatibility |
| model/tool catalog empty | keep backend non-selectable with exact capability reason |
| PuppyOne Agent engine corrupt | disable PuppyOne Agent only; application repair action |
| backend/provider auth rejected during turn | retain native session, quarantine affected route and reconnect |
| scan cancelled | retain last verified snapshot and terminate probe child |

One backend failure never changes another backend's readiness. No failure
causes automatic fallback or moves an existing session to another harness.

## 13. Acceptance tests

Implementation is complete only when automated fixtures cover:

- packaged GUI PATH missing user CLIs while known deterministic locations
  contain them;
- aliases, spaces, symlinks, broken links, non-executable files and executable
  identity-swap attempts;
- timeout, output overflow, malformed protocol, unsupported version and child
  cleanup for every backend probe;
- Codex initialize/account/model and native session success/failure fixtures;
- Claude executable/Node/SDK/auth/session and permission fixtures;
- Cursor detected-but-unsupported behavior until its protocol contract passes;
- strict isolation between PuppyOne Agent and user OpenCode profiles/sessions;
- no raw path/account/status/credential content crossing IPC;
- Agent-first picker keyboard behavior and backend-scoped Model validation;
- immutable `runtimeId` after product-session creation;
- one backend failure leaving other ready Agents selectable;
- refresh invalidation after login/logout, binary replacement, engine repair and
  authoritative authentication rejection;
- discovery staying off application/file/Sidebar critical paths with no
  interaction Long Task above 50 ms.

Manual evidence must include at least two ready native backends plus one
detected-but-unavailable backend. Each ready backend starts its own native
session, reports its own capabilities and can fail without changing the other
rows or silently switching the active session.
