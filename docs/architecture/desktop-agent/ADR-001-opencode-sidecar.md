# ADR-001: OpenCode sidecar as the primary local-agent harness

Date: 2026-07-11. Status: accepted and implemented.

## Decision

Use an exact, release-verified OpenCode executable behind a main-process-only
loopback HTTP/SSE boundary. Keep Codex app-server behind the same
`AgentRuntimePort` as a direct-CLI compatibility runtime. Do not import the
private, still-changing `@opencode-ai/core` V2 service graph.

```text
React -> typed IPC -> AgentService -> AgentRuntimePort
                                      +-- OpenCode sidecar (default)
                                      +-- Codex app-server (explicit direct)
```

## Why sidecar, not ACP, for the product path

OpenCode's server surface exposes the complete current harness event set,
including permission and structured questions. The source-audited ACP bridge
has a narrower event mapping and does not bridge `question.asked`. ACP remains
an interoperability canary, not the Chat UI's authoritative event contract.

## Why not import/fork core

The source-audited core package is private and its V2 runner still records
missing durable status, retry/doom-loop, MCP/plugin resolution, snapshots,
attachments, cancellation, compaction continuation and maintenance behavior.
A process boundary is more stable and preserves the tested upstream harness.

## Consequences

Benefits:

- provider, model, tool, MCP, skill, prompt, permission, session and compaction
  behavior stays upstream;
- PuppyOne owns a smaller security/presentation boundary;
- Codex direct auth remains available without pretending OpenCode is Codex;
- runtime upgrades are explicit manifest changes.
- an app-owned deterministic profile can keep repository config, plugins, MCP
  commands and permission overrides outside the trust boundary by default.

Costs:

- 55–70 MB compressed platform artifact plus runtime RSS;
- platform packaging/signing and release provenance;
- health, restart and migration compatibility tests;
- process startup on first OpenCode Chat use.
- global OpenCode plugins/config and repository-local OpenCode config are not
  imported implicitly; future MCP/skill configuration must use a main-owned
  authorization surface.

`OPENCODE_CONFIG_DIR` alone does not isolate upstream global discovery. The
implementation additionally redirects XDG config/cache/state and the
home-level `.opencode` scan into the app-owned profile while leaving provider
credential data under OpenCode's native ownership.

## Kill criteria

Revisit only if release evidence shows one of these cannot be corrected at the
sidecar boundary: missing critical events in main-only mode, impossible
signing/packaging on a supported platform, unapproved package/RSS/startup
budget, unsafe migration/rollback, or license/supply-chain failure.

No kill criterion was found by source/protocol analysis. The environment used
for this implementation prohibited loopback binding, so unrestricted
production smoke measurements remain a release gate rather than being
invented in this ADR.
