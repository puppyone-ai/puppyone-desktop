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
             eye = read claim         Codex / Claude / future adapters
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
execution routes. They are equal except where one product has an explicitly
named route. Today user OpenCode maps as follows:

```text
inventory product ID  opencode
runtime route ID      opencode-native
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

The neutral broker accepts authenticated, bounded activity frames, normalizes
them to the shared contract and confines paths to the active workspace. The
Renderer store projects active claims by file and operation. Editor chrome
consumes only the public presence projection:

```text
read claim   -> eye indicator
write claim  -> hand indicator
no claim     -> no indicator
```

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
  registration/                         owned, reversible Hook mutation
  bridge/                               generated Hook payload projection
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
- All file paths are canonicalized and workspace-confined before reaching the
  Renderer.
- Adding a provider extends descriptor registries and edge adapters; it does
  not add product branches to neutral services or settings UI.
