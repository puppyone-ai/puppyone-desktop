# Local Agents and Agent file activity

Status: implemented. This document defines two adjacent features that share
Agent product identities but must remain separate in product language, settings
ownership and code dependencies.

## 1. Product boundary

`Local Agents` answers one user question:

> Which Agent CLIs are installed on this computer, and which should appear in
> PuppyOne's Terminal launcher?

`Local Agent Hooks` is the adjacent, lower-priority settings page:

> Which PuppyOne-owned local Hooks are installed for each Agent CLI?

CLI availability and Hook enrollment are deliberately separate. Finding an
executable never mutates its configuration. Hiding an Agent from the Terminal
launcher never removes its Hook. Installing a Hook never changes the Editor
Agent provider picker; Editor runtimes retain their own readiness, sign-in and
capability checks.

## 2. System map

```text
                         Desktop Settings
                +-------------------------------+
                | Local Agents                  |
                | detected CLI + Terminal switch|
                +---------------+---------------+
                                |
                                | hidden launcher IDs
                                v
Terminal Agent locator ---> Terminal launcher ---> verified CLI launch
 filesystem only           visible detected IDs    Codex / Claude / Cursor /
 5-minute cache                                    OpenCode / Pi / Hermes


                +-------------------------------+
                | Local Agent Hooks             |
                | one enrollment row per Agent  |
                +---------------+---------------+
                                |
                                | explicit per-Agent mutation
                                v
Hook registration service ---> Terminal Agent Hook adapters
 Codex / Claude / Cursor                 |
 configurable; others manual             v
                              neutral activity broker
                              authenticated, normalized,
                              workspace-confined events
                                         |
                                         v
                              Editor presence layer
                              eye = read, hand = write
```

## 3. Local Agents architecture

### Discovery and launcher visibility

1. Opening Local Agents uses the same `terminal:agents-locate` bridge as the
   Terminal launcher. The locator performs bounded filesystem-only executable
   discovery; it never runs an Agent, reads accounts, lists models or changes
   Hook enrollment.
2. The shared catalog recognizes Codex, Claude Code, Cursor Agent, OpenCode,
   Pi Agent and Hermes Agent. Only detected CLIs are shown.
3. Every detected CLI is visible in Terminal by default.
   `puppyone.desktop.localAgents` stores only `hiddenTerminalAgentIds`, so the
   previous Editor visibility preference cannot accidentally hide launchers
   during migration.
4. `RightTerminalPanel` intersects detected IDs with this hidden set before
   rendering or launching a Terminal Agent.
5. The Editor provider picker is independent of this preference and continues
   using the native runtime catalog.

### Settings source layout

```text
src/features/local-agents/
  model/localAgentSelection.ts            pure Terminal visibility decisions
  ui/LocalAgentsSettingsView.tsx          CLI scan + launcher switches
  ui/LocalAgentHooksSettingsView.tsx      per-provider Hook enrollment

src/features/desktop-terminal/
  controller/useTerminalAgentLocator.ts   shared Renderer discovery controller
  ui/RightTerminalPanel.tsx               launcher visibility consumer

electron/main/terminal-agent/
  terminal-agent-locator.mjs              bounded filesystem-only locator
  activity/registration/                  Hook inspection and mutation
```

To add a Terminal Agent, extend the catalog and the authoritative launch
resolver together. Hook support is a separate descriptor/registration decision
and must not be inferred merely because an executable exists.

## 4. Agent file activity architecture

The feature observes activity emitted by cooperating Agent Hooks. It does not
parse terminal output, instrument the shell, monkey-patch filesystem APIs or
claim to observe arbitrary commands. Unsupported Agents simply produce no
presence claim.

For Codex, native Hooks are the production integration contract. Codex Hooks
cover shell commands, unified exec, `apply_patch`, local functions and nested
Code Mode tool calls. PuppyOne deliberately does not read `transcript_path`:
the transcript is private session content and is not a stable integration API.
Codex App Server has richer structured item events, but its WebSocket transport
is experimental and unsupported for production, so PuppyOne does not proxy the
native Terminal TUI through App Server merely to obtain presence events. See
the official [Codex Hooks](https://developers.openai.com/codex/hooks) and
[Codex App Server](https://developers.openai.com/codex/app-server) contracts.

The neutral broker accepts authenticated, bounded activity frames, normalizes
them to the shared contract and confines paths to the active workspace. The
Renderer store projects active claims by file and operation. Editor chrome
consumes only the public presence projection:

```text
read claim   -> eye indicator
write claim  -> hand indicator
no claim     -> no indicator
```

### Production event path

```text
Codex / Claude / Cursor CLI launched inside PuppyOne Terminal
        |
        | native PreToolUse / PostToolUse lifecycle
        v
PuppyOne-owned Hook command
        |
        | payload projector
        | - structured path fields
        | - apply_patch headers
        | - conservative literal shell reads
        | - discard command, content, output and transcript
        v
authenticated per-Terminal Unix socket / named pipe
        |
        v
provider adapter -> normalized activity broker -> canonical path boundary
        |                                      |
        | no exact workspace file              | safe relative file target
        v                                      v
drop visual claim                       BrowserWindow-owned IPC event
                                               |
                                               v
                                     per-file Renderer store
                                               |
                                      +--------+--------+
                                      v                 v
                                eye = reading      hand = writing
```

This path is intentionally one-way and metadata-only. The Hook bridge runs as
an Electron-as-Node subprocess, receives a short-lived Terminal-scoped endpoint
and token through environment variables, projects the provider payload before
transport, and sends one bounded frame. The public event contains only provider
identity, lifecycle, operation and canonical workspace-relative targets.

### Observation quality contract

| Native operation | Projection | UI result |
| --- | --- | --- |
| Structured `Read`, `Write`, `Edit`, search and file tools | Known provider path fields | Exact eye/hand claim |
| Codex `apply_patch` | Patch file headers only | Exact hand claim |
| Whitelisted read-only shell commands such as `tail`, `wc`, `cat`, `head`, `sed`, `od`, `rg` and `grep` with literal operands | Literal filenames only; raw command discarded; `sed -i` is rejected | Exact eye claim |
| Shell paths using variables, globs, command substitution, redirects, a prior `cd`, or an unknown command | Fail closed | No file claim |
| Arbitrary terminal programs or Agents without a supported Hook | Not observed | No file claim |

The shell projector is deliberately not a general shell parser. It may omit an
ambiguous read, but it must never guess a file from dynamic shell syntax. OS
filesystem watching is not a replacement: it can observe writes after the fact
but cannot reliably attribute reads to one Agent or Terminal session.

### Lifecycle and upgrades

`PreToolUse` opens a claim. Matching `PostToolUse` completes it; terminal or
source-session shutdown cancels it, and a bounded lease clears lost terminal
events. Completed and failed claims remain visible for four seconds so short
file operations remain perceivable without leaving stale UI behind.

The installed Hook bridge is a derived runtime artifact, not the source of
truth. Before every enrolled Terminal session, the Registrar compares every
installed bridge module with the app-bundled source and atomically refreshes an
outdated or incomplete copy. Hook configuration remains stable across app
updates; an enrolled Terminal session receives current bridge code without a
remove/reinstall cycle.

`Local Agent Hooks` reads the registration service's provider snapshot. Codex,
Claude Code and Cursor expose safely reversible switches. OpenCode, Pi and
Hermes are shown as manual integrations until an owned, reversible installer
exists. Missing CLIs cannot be newly enrolled, while an orphaned existing Hook
can still be removed. `needs-repair` remains visible and re-enabling the row
repairs the owned bridge/configuration.

`puppyone.desktop.agentFileActivityIndicators` globally controls whether
`.desktop-agent-file-presence` is rendered. The Hook page updates that visual
preference only after a per-provider enrollment mutation succeeds, and turns
it off only when no configurable PuppyOne Hook remains enabled.

An explicit per-Agent switch records PuppyOne's product-level consent; it does
not bypass an Agent's own security boundary. In particular, Codex can require
one native `/hooks` review for the exact Hook definition. PuppyOne never passes
a Hook trust-bypass flag and never edits another Agent's internal trust store.
A provider-native review may therefore appear once when that Agent next starts.

### Cursor Agent CLI enrollment

Cursor support in this feature means the local `agent` / `cursor-agent` CLI,
not Cursor's IDE chat surface and not a Cursor Editor backend inside PuppyOne.
The Registrar merges four owned command Hooks into the official user-level
`~/.cursor/hooks.json` schema:

```text
preToolUse          Read|Write|Grep|Delete -> started
postToolUse         Read|Write|Grep|Delete -> completed
postToolUseFailure  Read|Write|Grep|Delete -> failed
sessionEnd                                  -> close source session
```

Cursor uses the same user Hook file for its CLI and desktop app. Scope is
therefore enforced at the transport boundary: only a CLI launched in a
PuppyOne Terminal inherits the authenticated activity endpoint, token and
Terminal session ID. If Cursor's desktop app invokes the installed command,
the bridge has no PuppyOne session credentials and exits without emitting an
event. The Registrar never parses Cursor terminal output or transcripts.

Installation accepts Cursor Hook schema version 1 only, preserves unrelated
user fields and Hooks, uses compare-and-swap atomic writes, is idempotent, and
removes only exact PuppyOne-owned entries. An unknown schema version or edited
PuppyOne entry fails closed and participates in the batch rollback. Cursor
watches its Hook file and reloads changes automatically. See the official
[Cursor Hooks contract](https://cursor.com/docs/hooks) and
[Cursor CLI Hook release notes](https://cursor.com/changelog/cli-jan-08-2026).

### Source layout

```text
shared/agent-activity-contract/         provider-neutral event DTOs

electron/main/agent-activity/
  domain/                               normalized event/session rules
  application/                          activity service
  security/                             auth, frame and path policy
  transport/                            local Hook ingest server
  bootstrap/                            composition root

electron/main/terminal-agent/activity/
  terminal-agent-activity-adapter-port.mjs
  adapters/<provider>/descriptor.mjs    provider edge translation only
  registration/
    bridge-installer.mjs                atomic install + session-time freshness
    owned-json-file.mjs                 atomic compare-and-swap JSON primitive
    owned-config-mutation.mjs           Codex / Claude nested Hook format
    cursor-cli-hook-config.mjs          Cursor CLI flat Hook format
  bridge/
    puppyone-agent-hook.mjs             bounded authenticated transport
    payload-projector.mjs               content-free provider projection
    shell-file-intent.mjs               fail-closed literal read projection
  bootstrap/                            Terminal adapter composition

src/features/desktop-agent-presence/
  domain/                               file presence projection
  application/                          client/store lifecycle
  infrastructure/electron/              public bridge adapter
  ui/AgentFilePresence.tsx               eye/hand presentation

src/features/local-agents/
  ui/LocalAgentHooksSettingsView.tsx     per-Agent Hook status and enrollment
```

To add another Agent Hook, implement one adapter descriptor at the Terminal
edge and register it. Provider payload names and configuration formats must not
enter the neutral broker, shared contract, Editor workbench or Local Agents.
Only adapters whose configuration can be mutated safely and reversibly may be
marked configurable.

### Verification contract

Provider integration tests use sanitized, provider-versioned Hook fixtures.
Fixtures are rewritten test data, never raw captures: they use `/workspace`,
generic filenames and synthetic model/session/turn/tool IDs, and remove transcript
paths, developer usernames, home directories and repository names. The architecture
check rejects home paths, non-synthetic working directories and retained transcript
paths before a fixture can enter the build.
The required Codex regression path covers both the actual `Bash` read shape and
the `apply_patch` write shape. A socket-level test must run those fixtures
through the production Hook bridge, authentication, provider adapter, path
policy and broker, then assert that the Editor receives the correct
workspace-relative operation without raw commands, absolute paths or content.
Synthetic calls straight into an adapter are useful unit tests but are not
sufficient evidence that an installed Terminal Hook works.

## 5. Invariants

- Local Agents always means detected Terminal CLI launchers, never Editor
  provider selection or Hook enrollment.
- Local Agent Hooks is a separate Desktop App settings page immediately below
  Local Agents.
- Hook enrollment is explicit and per provider. A successful native mutation
  precedes the persisted activity-visibility preference.
- Every detected CLI is visible in Terminal by default; the preference stores
  only hidden launcher IDs.
- Terminal CLI discovery is filesystem-only and never reads or changes Hooks.
- Native discovery and Hook registration remain main-process concerns; the
  Renderer receives sanitized DTOs only.
- Terminal output parsing is not an activity source. Hook support is explicit,
  provider-scoped and best effort.
- Transcript files and Codex App Server's experimental WebSocket transport are
  not production activity sources.
- Dynamic or ambiguous shell syntax fails closed; only literal operands from a
  bounded read-only command allowlist create a file claim.
- Structured file tools are the primary observation contract. Shell recognition
  is a deliberately bounded compatibility fallback, not a promise to enumerate
  every executable or shell grammar corner case.
- An enrolled Terminal session refreshes stale installed bridge code before it
  receives activity credentials.
- All file paths are canonicalized and workspace-confined before reaching the
  Renderer.
- Relative Editor resources and absolute Explorer resources must project to the
  same canonical workspace-relative presence key.
- Both the target and workspace root are canonicalized before containment is
  evaluated, including macOS system symlink aliases.
- Completed or failed claims remain visible for the shared four-second
  perception window.
- Adding a provider extends descriptor registries and edge adapters; it does
  not add product branches to neutral services. Settings renders provider
  snapshots generically.
