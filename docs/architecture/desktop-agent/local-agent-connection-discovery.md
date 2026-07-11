# Local Agent and Provider connection discovery

Status: implemented normative boundary. Local inventory is presentation/setup evidence and is
not authority for starting new product sessions; OpenCode's connected Provider catalog remains
the Send authority.

This document defines how PuppyOne recognizes locally installed Codex, Cursor Agent and future
coding-agent tools without falsely claiming that every installation is a usable OpenCode model
Provider. It complements [ADR-003](ADR-003-opencode-only-chat-harness.md): OpenCode remains the
product Chat harness unless a later architecture decision explicitly changes that rule.

## 1. Why there are two discovery systems

The current OpenCode `/provider` catalog answers one question:

```text
Which inference Provider routes can this OpenCode harness use now?
```

It does not answer:

```text
Which coding-agent products are installed on this computer?
```

PuppyOne therefore needs two independent catalogs that meet only in presentation and explicit
integration policy.

```text
Local Agent Inventory                         OpenCode Provider Catalog
---------------------                         -------------------------
Codex CLI installed                           OpenAI / ChatGPT connected
Cursor Agent installed                        Anthropic connected
Claude Code installed                         OpenRouter connected
version / auth / protocol                      model capabilities
          |                                             |
          +-------------------+-------------------------+
                              v
                    Connection Policy
                       |          |
                       |          +-- selectable Provider route
                       +------------- detected local tool, not yet selectable
                              |
                              v
                    Provider picker presentation
```

An installed CLI must be recognized and shown. It must not become a selectable inference route
until authentication, protocol compatibility and an authorized bridge are all established.

## 2. Vocabulary

```text
Local tool          An executable/application found on the machine, such as codex or
                    cursor-agent.

Agent harness       Owns loop, tool execution, approvals, context and session semantics.
                    Codex app-server, Cursor Agent and OpenCode are separate harnesses.

Credential source  A supported account/API-key/OAuth mechanism. Presence does not prove that
                    a different product may copy or reuse the credential.

Provider route      The inference route selected inside the active harness. In the accepted
                    product path this comes from OpenCode /provider.connected.

Authorized bridge   A versioned, documented adapter allowed to translate one supported public
                    protocol/credential route without scraping private files.

Selectable          The route has passed install, version, authentication, bridge and model
                    capability checks for the current product path.
```

Do not use `Provider`, `CLI`, `model` and `harness` as interchangeable UI labels.

## 3. Discovery result model

Installation, authentication and integration are orthogonal fields. A single boolean such as
`available` loses the reason an item cannot be used.

```text
LocalAgentConnection
  id                    codex | cursor-agent | claude-code | future stable id
  displayName           safe product label
  installation          not-found | detected | unsupported | broken
  version               bounded normalized version or null
  authentication        unknown | signed-out | signed-in | expired | error
  integration           inventory-only | bridge-required | ready | incompatible | blocked
  capabilities          bounded advertised feature flags
  selectable            derived, never independently assigned
  statusMessage         user-facing recovery reason
  actions               refresh | learn-more in the current inventory DTO
```

Executable paths, account tokens, account identifiers, raw status output and credential-file
locations remain main-process data and do not cross IPC. Renderer receives a bounded label such
as `User installation` or `Application bundle` when source context is useful.

`selectable` is true only when all applicable gates pass:

```text
detected
  AND supported version
  AND authenticated by a public supported mechanism
  AND authorized bridge compatible with the fixed OpenCode harness
  AND at least one text + tools model
  AND workspace/security policy allows the route
```

## 4. When discovery runs

- Do not scan local CLIs on application startup, file open or Sidebar layout. Those are
  performance-critical paths.
- Run a bounded inventory scan when the user first opens Provider setup, explicitly presses
  Refresh, or opens Agent settings.
- Cache the sanitized snapshot for at most five minutes and invalidate it on explicit Refresh,
  executable change, sidecar restart or authoritative authentication rejection.
- Deduplicate concurrent inventory scans. Closing the popover does not terminate an already
  bounded scan; it may finish into the five-minute cache. Application disposal aborts active
  probes and every timeout/output-limit path kills its child process.
- A scan failure for one tool does not hide other detected tools.

## 5. Executable discovery

Packaged GUI applications often receive a different `PATH` from interactive shells. Searching
only `process.env.PATH` is insufficient, while launching a login shell is slow and executes
user-controlled shell startup code. Use a deterministic candidate registry.

### Candidate sources

```text
1. Already configured absolute executable path, if any
2. Current non-login process PATH
3. Product-specific user locations
     ~/.local/bin
     ~/.npm-global/bin
     ~/.bun/bin
     ~/.cargo/bin where applicable
4. Platform package-manager locations
     /opt/homebrew/bin
     /usr/local/bin
5. Signed application bundle helper path, when publicly documented
```

The list is platform-specific, bounded and tested. It is not a recursive home-directory scan.

### Command aliases

| Product | Canonical candidates | Notes |
| --- | --- | --- |
| Codex | `codex` | Require a successful bounded `codex --version` probe. |
| Cursor Agent | `cursor-agent`, `agent`, `cursor agent` | Prefer `cursor-agent`; `cursor` alone may be an IDE launcher or shim and must be classified before use. |
| Claude Code | `claude` | Inventory only until its independent integration contract is approved. |

### File and process safety

- Resolve the candidate with `realpath`, require a regular executable file and record the
  canonical identity so aliases do not create duplicate rows.
- Spawn directly with an argument array. Never use `shell: true` and never interpolate a path
  into a shell command.
- Version probes have a 1.5 second timeout, a 16 KiB combined-output cap and an explicit child
  kill path.
- Reject directories, devices, relative executables, newline-containing paths and candidates
  that change identity between validation and spawn.
- A user-owned symlink to a canonical executable is allowed after `realpath` validation.
- Diagnostic logs contain tool id, safe source class, duration and outcome; they do not contain
  home paths, account output or environment values.

## 6. Codex discovery and compatibility

OpenAI documents Codex app-server as the embedding interface for custom rich clients. It uses a
version-specific JSON-RPC protocol and exposes account, model, thread, turn, approval, item and
streaming event APIs. The protocol can generate a schema matching the installed CLI version.

Discovery levels:

```text
Level 1  codex executable + version
Level 2  app-server initialize handshake
Level 3  account/read authentication state
Level 4  model/list + required capability check
Level 5  approved product integration route
```

Rules:

- Level 1 is enough to show `Codex CLI - Detected` in Local tools.
- Levels 2-4 are lazy and use direct stdio JSON-RPC with strict schemas, timeouts and bounded
  output. Do not read or copy `~/.codex` credential files in Renderer or application code.
- `account/read` determines account state. `model/list` determines models and their supported
  effort/input options; static hard-coded model lists are not acceptable.
- A successful local Codex handshake proves Codex itself is usable. It does not turn Codex into
  an inference Provider inside OpenCode. `codex app-server` owns a separate agent loop.
- Under ADR-003, a detected/signed-in Codex installation is shown as `Detected - direct harness
  not enabled`. The selectable Codex-family route remains OpenAI/ChatGPT connected through
  OpenCode.
- If product strategy later enables direct Codex mode, that is a visible session-level harness
  choice with separate session ownership, approval and migration rules. It cannot be a silent
  fallback or be mislabeled as a Provider.

Official reference: [Codex App Server](https://learn.chatgpt.com/docs/app-server).

## 7. Cursor Agent discovery and compatibility

Cursor publicly documents three relevant surfaces:

- `cursor-agent status` for CLI authentication state;
- `--print --output-format stream-json` for NDJSON system, assistant, tool and terminal result
  events;
- `@cursor/sdk` for programmatic local/cloud agents using an explicit Cursor API key and its
  own billing/runtime contract.

Discovery levels:

```text
Level 1  cursor-agent/agent executable + version
Level 2  cursor-agent status, bounded and redacted
Level 3  documented stream-json or SDK compatibility version
Level 4  explicit credential/billing route approved for PuppyOne
Level 5  approved product integration route
```

Rules:

- Level 1 is enough to show `Cursor Agent - Detected` even when no OpenCode bridge exists.
- Treat `cursor`, `cursor-agent` and `agent` aliases that resolve to the same canonical binary as
  one installation.
- Status output is parsed in main, reduced to signed-in/signed-out/unknown and never forwarded
  verbatim because it may contain account or endpoint information.
- Stream consumers ignore additive unknown fields, correlate tool calls by id, require a
  terminal result when the process succeeds, and handle non-zero exit without assuming valid
  terminal JSON.
- PuppyOne never uses `--force`. Command/file actions retain explicit permission semantics.
- The SDK/API-key path and a locally signed-in CLI are different credential and billing
  contracts unless Cursor explicitly documents reuse. Do not infer that SDK calls may use a
  private CLI login cache.
- Cursor Agent is a separate harness. Under ADR-003 it is shown as `Detected - bridge not
  available` and is not selectable inside the OpenCode Provider list.

Official references:

- [Cursor CLI authentication](https://docs.cursor.com/en/cli/reference/authentication)
- [Cursor CLI parameters](https://docs.cursor.com/en/cli/reference/parameters)
- [Cursor stream JSON output](https://docs.cursor.com/en/cli/reference/output-format)
- [Cursor SDK announcement](https://cursor.com/changelog/sdk-release)

## 8. OpenCode Provider discovery

OpenCode remains the selectable inference authority for the accepted product path.

```text
GET /provider
  all[]                       catalog/display metadata
  connected[]                 configured credential route detected by OpenCode
  default[providerId]         default model id
        |
        v
PuppyOne capability gate
  input.text == true
  output.text == true
  toolcall == true
  status != deprecated
        |
        v
Selectable Provider -> selectable Model
```

`/config/providers`, a CLI executable and a credential-file existence check are not Send
authority. Remote credentials can still expire after discovery; an authoritative 401/auth
rejection quarantines the route, clears its selected Model and requests reconnect/refresh.

## 9. Provider picker presentation

The picker joins both catalogs without erasing their difference.

```text
+ Provider ------------------------------------------------+
| Connected routes                                         |
|  * OpenAI / ChatGPT     OAuth          Ready             |
|    Anthropic            API key        Ready             |
|                                                          |
| Local tools on this Mac                                  |
|    Codex CLI 0.x        Signed in      Direct not enabled|
|    Cursor Agent 20xx.x  Signed in      Bridge unavailable|
|                                                          |
| [Refresh]                         [Connect provider...]   |
+----------------------------------------------------------+
```

- A detected local tool is never omitted merely because it is not selectable.
- A non-selectable row is not a dead disabled option. It remains focusable, explains the exact
  missing gate and offers a valid action or `Learn why`.
- Connected Provider routes appear before local inventory because they can send the current
  OpenCode session.
- `Not installed` products are hidden from the compact picker but may appear in the full
  Connections settings page with an Install/Learn action.
- A signed-out detected tool offers its documented login action only if PuppyOne can observe
  completion safely. Otherwise it gives exact instructions and Refresh.
- Provider and Model stay separate controls. Choosing a local inventory row cannot populate
  models until `selectable` is true.

## 10. Main/Renderer boundary

```text
Renderer
  open provider picker / refresh / select public route id
        |
        v
typed preload IPC
        |
        v
Electron main
  createLocalAgentInventory
    candidate registry -> realpath -> version -> optional auth/protocol probe

  OpenCodeProviderCatalog
    /provider.connected -> capability filtering

  AgentConnectionPolicy
    merge presentation DTOs -> derive selectable routes
```

Renderer never receives generic spawn, command arguments, environment variables, raw stdout,
credential paths, auth tokens, sidecar URLs or passwords. Each supported tool has a specific
probe adapter and contract fixture.

Implemented source boundaries:

```text
electron/main/agent/connections/
  local-agent-inventory.mjs           orchestration/cache/cancellation
  local-agent-connection-policy.mjs   derived availability rules
  probes/
    codex-local-probe.mjs             version + app-server account/model probe
    cursor-local-probe.mjs            version + bounded status probe
    executable-candidates.mjs         platform candidate registry

shared/agent-contract/
  types.ts                              local-agent DTO type source
  local-connection-schema.mjs          strict sanitizing response projection

src/features/desktop-agent/
  application/LocalAgentConnectionLoader.ts  lazy Renderer-side request state
  ui/AgentProviderPicker.tsx                 accessible connected/local sections
  ui/AgentPickerPopover.tsx                  search + roving keyboard listbox
```

The local inventory service must not import React or OpenCode-specific provider payloads. The
OpenCode adapter must not scan the user's PATH.

## 11. Refresh and failure behavior

| Failure | UI result |
| --- | --- |
| executable not found | omit from compact picker; show `Not installed` in Connections |
| version probe timeout | show `Detected, probe failed`; Retry |
| unsupported version | show version and minimum/maximum tested range; Update/Learn |
| signed out | show `Sign in required`; documented Login action |
| status format unknown | keep Detected; auth `Unknown`; do not mark Ready |
| bridge unavailable | keep Detected; explain current OpenCode-only limitation |
| Provider credential rejected | remove from selectable routes for this snapshot; Reconnect |
| scan cancelled | retain last verified snapshot and stop child process |

One probe failure never changes OpenCode harness health. One Provider authentication failure
never erases the local installation row.

## 12. Acceptance tests

Implementation is complete only when automated fixtures cover:

- packaged GUI `PATH` missing both CLIs while known user locations contain them;
- `codex`, `cursor-agent`, `agent` and `cursor agent` alias deduplication by canonical identity;
- paths with spaces, symlinks, broken links, non-executable files and executable-swap attempts;
- version timeout, output overflow, malformed output, unsupported version and child cleanup;
- Codex initialize/account/model success, signed-out and additive unknown protocol fields;
- Cursor status signed-in/signed-out/unknown fixtures; stream execution remains outside this
  inventory boundary until an authorized bridge is approved;
- no raw path/account/status/credential content crossing the strict IPC schema;
- detected-but-unbridged rows visible and keyboard reachable but not selectable;
- only connected text-and-tools OpenCode routes enabling Model and Send;
- refresh invalidation after login/logout, binary replacement and authoritative auth rejection;
- discovery off the app/sidebar/file-open critical path, with no interaction Long Task above
  50 ms.

Manual evidence must show a machine with both Codex and Cursor installed: both appear under
Local tools, their real status is explained, and only legitimately ready routes can send.
