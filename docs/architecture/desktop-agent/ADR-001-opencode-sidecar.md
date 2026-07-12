# ADR-001: OpenCode sidecar process boundary

Date: 2026-07-11. Status: superseded by
[ADR-006](ADR-006-native-harness-adapters-and-acp.md) on 2026-07-13.

[ADR-005](ADR-005-multi-native-agent-backends.md) makes PuppyOne Agent one
selectable backend among native Agent integrations. This file is the historical
record for the former HTTP/SSE transport choice. Process isolation, integrity
and fail-closed security remain requirements, but ADR-006's ACP stdio boundary
is now authoritative.

## Decision

Use an exact, release-verified OpenCode executable behind a main-process-only
loopback HTTP/SSE boundary for the PuppyOne Agent backend. Model providers are
selected inside that backend. Do not import the private, still-changing
`@opencode-ai/core` V2 service graph.

```text
React -> typed IPC -> AgentService -> AgentRuntimePort
                                      +-- PuppyOne Agent adapter
                                                |
                                                +-- managed OpenCode sidecar
                                                |
                                                +-- provider/model catalog
```

## Why sidecar, not ACP, for the PuppyOne Agent path

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
- OpenAI/Codex, Anthropic and other providers remain choices inside one loop;
- runtime upgrades are explicit manifest changes.
- an app-owned deterministic profile can keep repository config, plugins, MCP
  commands and permission overrides outside the trust boundary by default.

Costs:

- 55–70 MB compressed platform artifact plus runtime RSS;
- platform packaging/signing and release provenance;
- health, restart and migration compatibility tests;
- process startup on first PuppyOne Agent inspection or session use.
- global OpenCode plugins/config and repository-local OpenCode config are not
  imported implicitly; future MCP/skill configuration must use a main-owned
  authorization surface.

`OPENCODE_CONFIG_DIR` alone does not isolate upstream global discovery. The
implementation additionally redirects XDG config/cache/state and the
home-level `.opencode` scan into the app-owned profile while leaving provider
credential data under OpenCode's native ownership.

Runtime distribution and customer recovery are governed by ADR-004. The
sidecar is a bundled PuppyOne component; a global OpenCode CLI is not a product
dependency.

## Kill criteria

Revisit only if release evidence shows one of these cannot be corrected at the
sidecar boundary: missing critical events in main-only mode, impossible
signing/packaging on a supported platform, unapproved package/RSS/startup
budget, unsafe migration/rollback, or license/supply-chain failure.

No kill criterion was found by source/protocol analysis. The environment used
for this implementation prohibited loopback binding, so unrestricted
production smoke measurements remain a release gate rather than being
invented in this ADR.
