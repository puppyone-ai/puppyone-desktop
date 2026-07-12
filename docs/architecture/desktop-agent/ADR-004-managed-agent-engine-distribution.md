# ADR-004: PuppyOne owns Agent engine distribution and recovery

Date: 2026-07-11. Status: accepted and implemented for discovery, development
bootstrap and unavailable-state UX.

## Context

OpenCode is the selected harness kernel, but “uses OpenCode” must not mean
“requires the customer to install and upgrade the OpenCode CLI.” Those are two
different distribution models. The latter leaks an internal implementation
choice into onboarding, creates version skew and makes PuppyOne support depend
on arbitrary PATH state.

The official `@opencode-ai/sdk@1.17.18` contains a generated client and a
`createOpencodeServer()` helper. The helper still executes `opencode` from
PATH. Therefore installing the SDK alone does not distribute the harness and
would reproduce the same customer-owned dependency if used as lifecycle
authority.

## Decision

PuppyOne owns the complete engine lifecycle.

```text
PuppyOne application release
|
+-- PuppyOne UI and main process
+-- verified OpenCode platform runtime        bundled product component
|     archive size + SHA-256
|     executable SHA-256 + exact version
|     current slot + verified previous slot
+-- app-owned OpenCode profile
+-- main-only loopback gateway
      +-- allowlisted operations
      +-- bounded JSON/SSE
      +-- timeout, redaction and owner correlation
```

Production discovery considers only the verified bundled current/previous
slots. It does not accept an environment override or scan the customer PATH,
`~/.opencode/bin`, Homebrew or another global installation. An external runtime
is available only through an explicit development opt-in and is never an
automatic product fallback.

Release CI downloads the exact platform artifact, verifies the immutable
manifest and packages it as an app resource. Updating the Agent engine ships as
a PuppyOne application update. A missing, corrupt or incompatible engine is a
PuppyOne repair condition, not an instruction to update OpenCode.

Development uses `scripts/prepare-opencode-dev-runtime.mjs`. It reuses a
verified local archive or downloads the pinned release, verifies size and
SHA-256, then stages the same layout used by packaging. `npm run dev` invokes
this preparation opportunistically; an offline failure does not prevent the
rest of PuppyOne from starting.

## SDK boundary

The official SDK is useful, but it has two different roles:

```text
SDK generated client/types          adopted at exact runtime version
SDK createOpencodeServer helper     rejected as lifecycle authority
                                    because it spawns `opencode` from PATH
OpenCode private core package       not a stable embedded ABI
```

PuppyOne uses `@opencode-ai/sdk/v2/client` at the same exact version as the
bundled runtime for generated REST paths and payloads. The SDK is wrapped by a
main-process gateway that preserves the product invariants: loopback only,
Basic auth kept in main, no redirects, response/SSE byte limits, request
timeouts, redaction and an explicit endpoint allowlist. The bounded SSE parser
remains at the gateway because it coordinates reconnect repair before releasing
new events. The SDK server helper and SDK client are never exposed through
preload or Renderer.

## User experience

```text
Engine ready
  Chat input and Send enabled.

Engine preparing / repair needed
  Draft input remains editable.
  Send is temporarily disabled.
  Compact status says PuppyOne Agent needs repair/preparation.
  Retry checks PuppyOne's managed component.
  Optional secondary copy may say “powered by OpenCode.”

Never shown
  “Install OpenCode”
  “Update OpenCode CLI”
  an external-runtime selector
```

The harness brand may appear in About, diagnostics and attribution. It must
not become an onboarding prerequisite or the primary error title.

## Product cost and pricing boundary

The runtime and the inference service are separate cost centers.

```text
OpenCode harness runtime
  MIT component bundled with PuppyOne.
  No separate customer installation or harness fee.

Model inference
  Phase 1: customer-authorized provider account/API key (BYOK/OAuth).
           Provider bills inference; PuppyOne shows provider/model clearly.
  Future: optional PuppyOne-managed credits or team plan.
          This is a billing/provider route, not a different harness.

Local coding-product subscriptions
  Codex CLI, Claude Code or Cursor installation does not imply reusable model
  entitlement. PuppyOne may detect and show the installation in Local tools;
  only a documented authorized provider bridge may make it selectable.
```

This keeps the first product version economically simple: PuppyOne absorbs
engine distribution and update cost; customers pay only their chosen inference
route unless they later opt into a PuppyOne-managed plan.

## Pi Agent or another embedded kernel

Pi is a legitimate embedded-kernel candidate. Its official monorepo publishes
MIT packages for a stateful agent loop, multi-provider inference and a coding
agent SDK. As of this decision, the former
`@mariozechner/pi-agent-core` name is deprecated in favor of
`@earendil-works/pi-agent-core`; a spike must pin the current namespace and an
exact release rather than copying an old blog example.

Embedding Pi would remove the separate OpenCode executable, but it would also
move more harness responsibility into PuppyOne. Before a replacement decision,
the spike must demonstrate parity for session resume/history, typed tools,
permissions/questions, cancellation, MCP/skills, model routing, compaction,
streaming, persistence, package sandboxing and provenance.

```text
Managed OpenCode sidecar
  larger platform artifact
  mature complete harness remains upstream
  strong process fault/security boundary

Embedded Pi packages
  native TypeScript integration and direct events
  potential packaging simplification (must be measured)
  PuppyOne owns more tool, permission, persistence and upgrade composition
```

Pi is not a fallback for a missing OpenCode binary and does not create a
runtime selector in the UI.

Replacing the sole harness requires a new ADR and migration plan. Provider
selection remains independent of that decision.

## Consequences

Benefits:

- zero customer CLI prerequisite and deterministic support surface;
- application and engine versions are tested and rolled back together;
- old global OpenCode installations cannot disable Chat;
- the exact-version SDK is adopted without surrendering the trust boundary;
- billing language distinguishes a free bundled harness from paid inference.

Costs:

- roughly 55–70 MB compressed per platform plus signing/notarization work;
- PuppyOne owns release staging, update and repair quality;
- local development needs a one-time pinned runtime download.

## Upstream references

- OpenCode SDK source:
  `anomalyco/opencode@9976269:packages/sdk/js/src/server.ts`
- [Pi official monorepo and packages](https://github.com/badlogic/pi-mono)
- [Pi coding-agent SDK documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
