# ADR-001: OpenCode sidecar process boundary

Date: 2026-07-11. Status: retired and superseded by
[ADR-006](ADR-006-native-harness-adapters-and-acp.md).

## Historical decision

The first architecture selected a main-process-only OpenCode HTTP/SSE sidecar
for PuppyOne Agent. That transport and its implementation instructions are no
longer part of the product architecture.

## Retirement

The production implementation now uses:

```text
PuppyOne Agent
  -> provider-neutral ACP adapter
  -> JSON-RPC 2.0 over child-process stdio
  -> bundled, pinned OpenCode kernel in an isolated PuppyOne profile
```

The former loopback HTTP client, SSE event stream, sidecar authentication and
SDK path must not be restored without a new ADR. Process isolation, executable
integrity, workspace authorization and fail-closed permissions remain current
requirements through ADR-004 and ADR-006.

Detailed historical reasoning remains available in Git history. This file is a
tombstone so searches for ADR-001 cannot be mistaken for active guidance.
