# Claudian source-adoption ledger

Pinned source audit: `YishenTu/claudian@7d7cc84c60a77431aaccda7ff49a2f1f4ae1c2ab`.
Repository: <https://github.com/YishenTu/claudian>. License: MIT; see `LICENSE`.

PuppyOne adopts selected frontend interaction patterns and native protocol-orchestration
patterns. The implementation is rewritten against PuppyOne's normalized Agent contract,
canonical workspace authorization, process lifecycle, design tokens, virtualized timeline and
accessibility rules. No Claudian prompt, credential store, conversation database, Obsidian API
integration or brand asset is included.

| PuppyOne implementation | Audited upstream reference | Adoption and modification |
| --- | --- | --- |
| `src/features/desktop-agent/ui/AgentPartRenderer.tsx` and `ui/activity/**` | `src/features/chat/rendering/MessageRenderer.ts`, `ToolCallRenderer.ts`, `WriteEditRenderer.ts`, `collapsible.ts` | Stable React renderer registry and accessible disclosure rewrite. Adopts compact tool rows, branch-style expanded content and bounded inline diff presentation. Adds strict normalized DTOs, keyboard semantics and virtual-list-safe lifecycle. |
| `src/features/desktop-agent/ui/AgentPickerPopover.tsx`, `AgentProviderPicker.tsx`, `AgentModelPicker.tsx` | `src/style/toolbar/model-selector.css`, chat model selector behavior | React listbox rewrite with click, Escape, outside click, arrows, Home/End, typeahead/search, focus return and `aria-disabled` inspectable local rows. Provider and Model remain separate backend-scoped controls; ADR-005 adds a distinct Agent selector before them. |
| `src/features/desktop-agent/ui/AgentComposer.tsx` | `src/style/components/input.css` | Adopts the compact bordered composer hierarchy; preserves PuppyOne attachment, context, mode, Send/Stop and security boundaries. |
| `src/features/desktop-agent/ui/desktop-agent.css` and `ui/styles/*.css` | `src/style/base/{variables,animations,container}.css`, `src/style/components/{messages,input,toolcalls,code,thinking}.css`, `src/style/features/diff.css`, `src/style/toolbar/model-selector.css` | Tokenized, responsibility-split rewrite using only PuppyOne semantic colors, spacing and responsive container queries. No upstream branding or fixed theme palette. |
| `electron/main/agent/protocols/acp/**` | `src/providers/acp/AcpClientConnection.ts`, `AcpJsonRpcTransport.ts`, `AcpSessionUpdateNormalizer.ts`, `methodNames.ts` | Provider-neutral JavaScript rewrite of ACP method fallback, long-running prompt semantics and normalized session updates. Adds strict JSON-RPC framing limits, redaction and a fail-closed server-request allowlist. |
| `electron/main/agent/runtimes/opencode-protocol/opencode-acp-adapter.mjs` | `src/providers/opencode/runtime/OpencodeChatRuntime.ts` | Session-scoped ACP lifecycle adaptation. PuppyOne removes Claudian conversation ownership, prompt settings and Obsidian state; OpenCode remains the harness while PuppyOne owns only routing, approvals and event projection. |
| `electron/main/agent/runtimes/claude/claude-message-channel.mjs` and `claude-spawn.mjs` | `src/providers/claude/runtime/ClaudeMessageChannel.ts`, `customSpawn.ts`, `ClaudeQueryOptionsBuilder.ts` | Bounded persistent-query channel and Electron-safe spawn adaptation. PuppyOne disables prompt queuing, forbids permission bypass, limits settings to the user source, redacts diagnostics and rejects unsupported secure CLI capabilities. |

Claudian's imperative DOM renderer and hover-only model menu were not copied. PuppyOne keeps
React ownership, a maximum of 120 mounted transcript rows, explicit reduced-motion behavior and
the multi-native backend boundary in
[`ADR-005`](../../docs/architecture/desktop-agent/ADR-005-multi-native-agent-backends.md).
Each supported native harness still owns its own loop, tool calling and native sessions.
PuppyOne does not import Claudian as a runtime dependency and does not rename a Claudian harness
as a PuppyOne harness.
