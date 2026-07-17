# ADR-003: OpenCode is the only product Chat harness

Date: 2026-07-11. Status: retired and superseded by
[ADR-005](ADR-005-multi-native-agent-backends.md) and
[ADR-006](ADR-006-native-harness-adapters-and-acp.md).

## Historical decision

This ADR formerly required every new Chat session to use one OpenCode harness
and treated direct native Agent integrations as legacy paths. That product
routing model is no longer valid.

## Retirement

The current architecture is multi-native:

```text
AgentRuntimeRegistry
  +-- Codex          -> native codex app-server
  +-- Claude Code    -> official Agent SDK + Claude executable
  +-- OpenCode       -> user-owned OpenCode ACP route
  +-- PuppyOne Agent -> managed OpenCode ACP route
  +-- Cursor Agent   -> diagnostics only until protocol acceptance
```

There is no universal OpenCode requirement, harness nesting, credential
translation or silent fallback. Detailed historical reasoning remains in Git
history; this tombstone prevents obsolete implementation instructions from
competing with the current architecture.
