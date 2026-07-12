# OpenCode harness adoption spike

> Scope: this spike records why the managed OpenCode sidecar was selected as
> the internal harness kernel for `PuppyOne Agent`. It is not evidence for
> routing Codex, Claude Code, Cursor or user-managed OpenCode sessions through
> that kernel. See
> [ADR-005](ADR-005-multi-native-agent-backends.md) for product-wide routing.

## Pins and local evidence

```text
Source audit checkout    anomalyco/opencode@9976269ab1accfc9f9dc98a4a688c516934de422
Source package version   1.17.18
Immutable runtime tag    v1.17.18
Release commit           b8374b5a7c532e51aeb66b1dee9278de91526ef5
Prompt manifest commit   b8374b5a7c532e51aeb66b1dee9278de91526ef5
License                  MIT
Local research CLI       1.1.33 (below the supported 1.17.18 protocol floor)
Local binary bytes       99,233,520
Local binary SHA-256     0f8016e7b95534c82a46c7e03c0223a651590aa3855d0b022b575467bd41e2c5
Version cold time        2.52 s (first local invocation)
Version warm times       0.87 / 0.85 / 0.84 / 0.84 s
v1.17.18 archives        55,170,827–69,581,443 bytes by platform
4,000-event projection   mean 5.76 ms; p99 9.22 ms (131 samples)
steady 2,000-row delta   mean 1.15 ms; p99 2.10 ms (655 samples)
2,000-row virtual mount  mean 9.32 ms; p99 31.33 ms (81 samples)
mounted row budget       <= 120
```

The figures above are the original adoption-spike capture. The 2026-07-12
architecture-closeout rerun on the same M2 Pro measured projection mean/p99
`2.17/2.77 ms`, steady delta `0.45/0.83 ms`, and virtual mount/dispose
`4.45/9.59 ms`. It also added bounded 128 KiB Markdown, 64 KiB command plus
240-line diff, and 500-model picker scenarios. The machine-readable current
evidence is
`benchmarks/performance/baselines/issue-027-agent-chat-m2-pro-2026-07-12.json`.

The archive filenames, byte sizes and SHA-256 values for six supported
platform/architecture pairs are machine checked in
`vendor/opencode/runtime-manifest.json`.

The local 1.1.33 executable was useful only for binary/startup measurements.
It was not treated as protocol-compatible with the managed `PuppyOne Agent`
backend: that backend accepts a runtime only at or above the exact 1.17.18
contract fixture used here. A separately selected user-OpenCode backend owns
its own compatibility and readiness result; it is never a silent fallback for
PuppyOne Agent.

The broader architecture audit used the later `dev` commit shown above. Prompt
hashes were separately recomputed from the exact runtime release commit; all 18
release prompt files matched the checked manifest. This distinction prevents a
same-version development checkout from being mistaken for executable
provenance.

## Capability matrix

| Capability | Sidecar HTTP/SSE | ACP stdio | PuppyOne adapter evidence |
|---|---:|---:|---|
| create / prompt / cancel | yes | yes | allowlisted client + adapter tests |
| text/reasoning/tool/usage | yes | yes | recorded global-event fixture |
| permission | yes | yes | event and correlated reply tests |
| structured question | yes | no complete event bridge at audited commit | sidecar question fixture/dock |
| resume / list / fork | yes | yes | client, persistence, controller paths |
| model / mode / command | yes | yes | inspection DTO and controls |
| MCP / skills | harness-native | ACP accepts MCP servers | pinned harness; managed profile denies unapproved repository config |
| compaction | yes | not a first-class ACP method | native summarize endpoint |
| restart / quit | process boundary | process boundary | sidecar lifecycle tests |

## Protocol gaps and decision

The sidecar requires a loopback server, auth secret and a global SSE stream.
PuppyOne moves all three into Electron main, unlike the upstream Desktop
renderer connection. ACP is attractive as a standard boundary, but source at
the audited commit forwards permission/message updates and lacks complete
structured-question parity. Sidecar is therefore the selected transport inside
PuppyOne Agent, not a product-wide default backend.

The source spike also found that the normal OpenCode profile can discover
repository config, external skills, plugins and MCP commands before PuppyOne
has authorized them. The product profile therefore uses an isolated
app-owned config directory, `OPENCODE_PURE`, disabled project config/external
skills and a session-final permission ruleset. Project instructions are read
and bounded by Electron main, then passed through the native `system` field.

## Measurements that require the release runner

This coding environment denied local TCP bind. The ACP executable also failed
when its internal server attempted to bind. No elevated command was requested,
per the implementation constraint. Therefore idle/active RSS, live event p95,
authenticated prompt latency, crash/reconnect, offline migration and signed
package deltas must be produced by the unrestricted Electron release-smoke job.

Release must not publish without recording:

```text
cold/warm health p50/p95
idle and active RSS p50/p95
steady event main->renderer latency p95
package delta per platform
abort and SIGTERM/SIGKILL behavior
offline start and corrupted-current -> previous-slot fallback
signed/notarized launch on every supported platform
```

Static/source results select sidecar; these remaining numbers can trigger the
ADR kill criteria but cannot silently change the architecture.
