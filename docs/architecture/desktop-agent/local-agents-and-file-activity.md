# Local Agents and Agent file activity

Status: implemented. This document defines two adjacent features that share
Agent product identities but must remain separate in product language, settings
ownership and code dependencies.

## 1. Product boundary

`Local Agents` answers one user question:

> Which coding Agents installed on this computer should be available as
> compute choices in the Editor?

`Appearance > Agent file activity` answers a different question:

> Should the Editor show an eye while an Agent reads a file and a hand while
> an Agent writes it?

Local Agents is therefore an inventory and selection surface. It never exposes
Hook installation, terminal event transport, read/write icons, activity status
or display configuration. Agent file activity is a global visual preference;
its native Hook enrollment is an implementation detail owned by the presence
feature.

The bundled PuppyOne Agent remains an internal/default runtime and is not a
locally installed Agent choice. The Local Agents list currently recognizes
Codex, Claude Code, OpenCode and Cursor Agent through the Editor's canonical
local inventory.

## 2. System map

```text
                          Desktop Settings
                 +-------------------------------+
                 | Local Agents                  |
                 | installed products + switches |
                 +---------------+---------------+
                                 |
                                 | enabled product IDs
                                 v
Local Agent inventory ---> Editor Agent picker ---> selected native runtime
  bounded probes             only installed +       Codex / Claude /
  sanitized cache            explicitly enabled     OpenCode / Cursor gate


                 +-------------------------------+
                 | Appearance                    |
                 | Agent file activity switch    |
                 +---------------+---------------+
                                 |
                  one consent    |    atomic native enrollment
                       +---------+---------+
                       v                   v
             Editor presence layer    Terminal Agent Hook adapters
             eye = read claim         Codex / Claude / Cursor CLI
             hand = write claim                 |
                       ^                         v
                       +------ neutral activity broker
                              authenticated, normalized,
                              workspace-confined events
```

The two branches meet only at stable Agent product identities and at the final
Editor surface. Selecting an Agent does not enable its activity visualization.
Enabling activity visualization does not add that Agent to the Editor picker.

## 3. Local Agents architecture

### Discovery and selection flow

1. Opening Local Agents calls the existing `discoverLocalAgentConnections`
   bridge. It does not use the Terminal launcher catalog or inspect terminal
   text.
2. Main-process inventory probes resolve a bounded product registry, return a
   sanitized `AgentLocalConnection` snapshot and reuse the existing TTL cache.
3. The page displays only products whose installation is not `not-found`.
   Readiness details stay in accessible metadata/tooltips; each visible product
   remains a compact name-and-switch row.
4. `puppyone.desktop.localAgents` stores explicitly enabled inventory product
   IDs. The default is empty, so a local Agent appears in the Editor only after
   the user selects it.
5. The Editor provider picker intersects the enabled product IDs with the live
   runtime catalog and current installation readiness. Sign-in, compatibility
   and capability gates remain owned by each runtime.

Inventory IDs describe installed products; runtime IDs describe concrete
execution routes; activity provider IDs describe Hook normalization adapters.
They are equal except where one product has an explicitly named route. Current
aliases are centralized as follows:

```text
inventory product ID  runtime route ID  activity provider ID
cursor-agent          cursor            cursor
opencode              opencode-native   opencode
```

This mapping is centralized in
`src/features/local-agents/model/localAgentSelection.ts`. Do not scatter
aliases through settings UI or persist runtime implementation names in the
Local Agents preference.

### Source layout

```text
src/features/local-agents/
  index.ts
  model/
    localAgentSelection.ts              pure installed/selected decisions
  infrastructure/electron/
    localAgentInventoryClient.ts        narrow preload client
  ui/
    LocalAgentsSettingsView.tsx         scan + compact selection rows

src/features/desktop-agent/
  domain/agent-backend-routing.ts       generic enabled-runtime filter
  ui/RightAgentPanel.tsx                provider picker consumer

electron/main/agent/connections/
  local-agent-inventory.mjs             bounded orchestration + safe cache
  tools/                                 extensible product descriptors
```

To add a locally selectable Agent, add its inventory tool descriptor and its
native runtime adapter/readiness contract. Add one centralized ID mapping only
when its inventory product ID intentionally differs from its runtime route ID.
The settings page must not grow provider-specific branches.

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
updates, and users do not need to toggle the Appearance setting to receive a
bridge fix.

`puppyone.desktop.agentFileActivityIndicators` is opt-in and globally controls
whether `.desktop-agent-file-presence` is rendered. Turning the Appearance
switch on opens one concise permission dialog for the whole feature; it does
not expose per-Agent permissions. Confirming it discovers locally installed
Agents and reconciles all supported, safely configurable Hooks as one batch.
The visual preference is enabled only after that batch succeeds. Canceling or
failing the flow leaves the preference off, and a partial mutation is rolled
back. Turning the preference off removes PuppyOne-owned configurable Hooks
before hiding the visual treatment.

This dialog records PuppyOne's product-level consent; it does not bypass an
Agent's own security boundary. In particular, Codex can require one native
`/hooks` review for the exact Hook definition. PuppyOne never passes a Hook
trust-bypass flag and never edits another Agent's internal trust store. A
provider-native review may therefore appear once when that Agent next starts.
Hook controls and provider-specific trust state never move into Local Agents.

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
  ui/AgentFileActivityAppearanceSetting.tsx
                                        Appearance + enrollment reconciliation
  ui/AgentFileActivityPermissionDialog.tsx
                                        one product-level consent step
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

- Local Agents always means installed Editor compute choices, never appearance.
- Agent file activity always lives in Appearance, never General or Local Agents.
- Its enable flow is one batch permission action; successful Hook enrollment
  precedes the persisted visual preference, while cancel/failure changes nothing.
- The Local Agents UI shows a product name and one switch, with no visible
  description paragraph beneath the name.
- Inventory probes and runtime readiness remain main-process concerns; the
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
  not add product branches to neutral services or settings UI.
