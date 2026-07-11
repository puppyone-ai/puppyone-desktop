# OpenCode source-adoption ledger

Pinned source audit: `anomalyco/opencode@9976269ab1accfc9f9dc98a4a688c516934de422`.
Runtime release: immutable tag `v1.17.18`. License: MIT; see `LICENSE`.
Runtime prompt manifest: `anomalyco/opencode@b8374b5a7c532e51aeb66b1dee9278de91526ef5`.

| PuppyOne implementation | Upstream behavioral reference | Adoption |
|---|---|---|
| `electron/main/agent/runtimes/opencode/opencode-sidecar-host.mjs` | `packages/desktop/src/main/server.ts`, `packages/desktop/src/main/sidecar.ts` | Independent main-only rewrite of lazy process, health, event stream, graceful stop and kill fallback. PuppyOne does not expose credentials to Renderer. |
| `electron/main/agent/runtimes/opencode/opencode-http-client.mjs` | `packages/opencode/src/server/routes/**`, generated SDK | Narrow handwritten client for the allowlisted API only; no generic HTTP proxy. |
| `electron/main/agent/runtimes/opencode/opencode-events.mjs` | `packages/app/src/context/global-sync/event-reducer.ts`, `packages/opencode/src/acp/event.ts` | React/PuppyOne event normalization rewrite with bounded DTOs. |
| `electron/main/agent/runtimes/opencode/opencode-security-policy.mjs` | `packages/opencode/src/permission/index.ts`, `packages/opencode/src/agent/agent.ts`, `packages/opencode/src/config/config.ts` | Independent fail-closed policy. Interactive unknown/plugin/MCP tools ask, plan allows only read-oriented tools, and inherited config/permission/plugin overrides are disabled. |
| `electron/main/agent/runtimes/opencode/opencode-project-instructions.mjs` | `packages/opencode/src/session/instruction.ts`, `packages/opencode/src/session/llm/request.ts` | Main-owned canonical replacement for automatic project instruction discovery; one bounded in-workspace file is appended through the native per-request system field. |
| `src/features/desktop-agent/agentProjection.ts` | `packages/app/src/pages/session/timeline/projection.ts` | Behavioral port of stable part reconciliation; implementation rewritten for React and the PuppyOne event contract. |
| `src/features/desktop-agent/AgentTranscript.tsx` | `packages/app/src/pages/session/timeline/message-timeline.tsx` | Independent fixed-budget virtual timeline using PuppyOne row and measurement contracts. |
| `src/features/desktop-agent/components/AgentPartRenderer.tsx` | `packages/session-ui/src/components/message-part.tsx` | Registry pattern adopted; renderers and styles are PuppyOne-owned. |
| `src/features/desktop-agent/application/AgentSessionController.ts` | OpenCode global sync/session store behavior | Independent external-store controller with PuppyOne authorization and replay semantics. |

No OpenCode logo, brand skin, raw prompt body, or SolidJS component is copied.
Prompt bodies execute inside the verified upstream sidecar. Their source hashes are
recorded in `PROMPT_MANIFEST.json`.
