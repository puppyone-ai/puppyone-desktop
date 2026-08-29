# Terminal

Terminal is the right-side interactive shell surface. It owns terminal
sessions, xterm rendering, PTY lifecycle, session selection, and the launcher
shown before a new session starts.

The launcher can start a plain shell or use a locally installed coding Agent as
the shell's first foreground command. This does not merge Terminal with Agent
Chat: Terminal remains a byte-stream PTY product, while Agent Chat remains a
typed native-runtime product.

## Start here

- [Terminal Architecture](../desktop-terminal-architecture.md) is the current
  implementation contract: product model, source boundaries, multi-session
  lifecycle, stable xterm ownership, shell-hosted Agent execution, rendering,
  performance, security, and verification.
- [Terminal Session Groups and Split Layout](session-groups-and-split-layout.md)
  is the accepted next-version contract for Cursor-style Session-tab dragging,
  native left/right/top/bottom Groups, stable Runtime reparenting, resize,
  accessibility, implementation boundaries, and release acceptance. Its
  durable decision is recorded in
  [ADR-002](decisions/ADR-002-native-terminal-groups-and-split-layout.md).
- [Local Agents and Agent file activity](../desktop-agent/local-agents-and-file-activity.md)
  defines shared Terminal launcher discovery and the implemented native
  Hook/plugin activity path without replacing Agent TUIs.
- [Terminal Decisions](decisions/README.md) records the native split decision
  and its relationship to the implemented activity architecture.
- [Terminal Rendering Remediation History](rendering-remediation-history.md)
  preserves the original CJK clipping diagnosis and implementation record.

## Ownership boundaries

- [Workspace](../desktop-sidebar-architecture.md) owns the auxiliary-panel
  container, width, visibility, and surface switching.
- Terminal owns every terminal session, its xterm runtime, its PTY, and the
  pre-launch selector. Its shared Session Header owns only navigation chrome,
  responsive density, overflow, focus, and activation motion; session mutations
  remain callback-driven through the Terminal controller. In the accepted
  split target, Terminal additionally owns Group membership and recursive split
  metadata. Those remain Renderer presentation state and never enter the App
  Shell, preload process authority, or Electron PTY service.
- Terminal Agent adapters own provider Hook/plugin enrollment and native event
  normalization. The provider-neutral Agent Activity broker owns live
  workspace claims, while the cross-surface Renderer presence feature owns
  Editor/Explorer presentation. Editor never parses a Terminal or provider
  payload.
- [Agent](../desktop-agent/README.md) owns Agent Chat, native Agent protocols,
  accounts, models, approvals, and Chat sessions. Terminal does not reuse those
  readiness probes or runtime adapters. A future Chat activity source may reuse
  the neutral public activity contract without importing Terminal adapters.
- Source Control owns Git reconciliation. Terminal commands can invalidate
  repository views but never become repository truth.
