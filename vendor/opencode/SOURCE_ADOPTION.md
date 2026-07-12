# OpenCode source-adoption ledger

Pinned source audit: `anomalyco/opencode@9976269ab1accfc9f9dc98a4a688c516934de422`.
Runtime release: immutable tag `v1.17.18`. License: MIT; see `LICENSE`.
Runtime prompt manifest: `anomalyco/opencode@b8374b5a7c532e51aeb66b1dee9278de91526ef5`.

| PuppyOne implementation | Upstream behavioral reference | Adoption |
|---|---|---|
| `electron/main/agent/runtimes/opencode-protocol/opencode-acp-adapter.mjs` | `packages/opencode/src/cli/cmd/acp.ts`, `packages/opencode/src/acp/{agent,service,event,permission}.ts` | Main-only ACP lifecycle adapter. OpenCode owns the loop and native sessions; PuppyOne translates ACP config, events and permission requests into its provider-neutral contract. Managed launch is loopback-only and `--pure`. |
| `electron/main/agent/protocols/acp/**` | Agent Client Protocol v1 method and event schema used by OpenCode | Independent bounded NDJSON JSON-RPC 2.0 client with method-name compatibility, no arbitrary prompt timeout and an allowlisted callback surface. No HTTP SDK client or generic proxy is shipped. |
| `electron/main/agent/runtimes/opencode-protocol/opencode-security-policy.mjs` | `packages/opencode/src/permission/index.ts`, `packages/opencode/src/agent/agent.ts`, `packages/opencode/src/config/config.ts` | Independent fail-closed managed policy. Unknown/plugin/MCP tools ask, plan denies mutations, inherited managed overrides are removed, and external plugins/skills are disabled. |
| `electron/main/agent/security/authorized-project-instructions.mjs` | `packages/opencode/src/session/instruction.ts`, `packages/opencode/src/session/llm/request.ts` | Main-owned canonical instruction authorization. One bounded in-workspace instruction file is appended without replacing the upstream OpenCode prompt. |
| `electron/main/agent/security/acp-workspace-files.mjs` | `packages/opencode/src/acp/service.ts` file callbacks | PuppyOne-specific canonical workspace delegate with symlink, traversal, binary and size defenses. This is stricter than the upstream client callback surface. |
| `src/features/desktop-agent/domain/agent-projection.ts` | `packages/app/src/pages/session/timeline/projection.ts` | Behavioral port of stable part reconciliation; implementation rewritten for React and the PuppyOne event contract. |
| `src/features/desktop-agent/ui/AgentTranscript.tsx` | `packages/app/src/pages/session/timeline/message-timeline.tsx` | Independent fixed-budget virtual timeline using PuppyOne row and measurement contracts. |
| `src/features/desktop-agent/ui/AgentPartRenderer.tsx` | `packages/session-ui/src/components/message-part.tsx` | Registry pattern adopted; renderers and styles are PuppyOne-owned. |
| `src/features/desktop-agent/application/AgentSessionController.ts` | OpenCode global sync/session store behavior | Independent external-store controller with PuppyOne authorization and replay semantics. |

No OpenCode logo, brand skin, raw prompt body, or SolidJS component is copied.
Prompt bodies execute inside the verified upstream runtime. Their source hashes are
recorded in `PROMPT_MANIFEST.json`.
