# Claudian frontend source-adoption ledger

Pinned source audit: `YishenTu/claudian@7d7cc84c60a77431aaccda7ff49a2f1f4ae1c2ab`.
Repository: <https://github.com/YishenTu/claudian>. License: MIT; see `LICENSE`.

PuppyOne adopts frontend interaction and presentation patterns only. The implementation is a
React/TypeScript rewrite against PuppyOne's normalized Agent contract, design tokens,
virtualized timeline and accessibility rules. No Claudian provider, Claude harness, session
authority, prompt, credential logic, Obsidian API integration, brand asset or runtime code is
included.

| PuppyOne implementation | Audited upstream reference | Adoption and modification |
| --- | --- | --- |
| `src/features/desktop-agent/ui/AgentPartRenderer.tsx` and `ui/activity/**` | `src/features/chat/rendering/MessageRenderer.ts`, `ToolCallRenderer.ts`, `WriteEditRenderer.ts`, `collapsible.ts` | Stable React renderer registry and accessible disclosure rewrite. Adopts compact tool rows, branch-style expanded content and bounded inline diff presentation. Adds strict normalized DTOs, keyboard semantics and virtual-list-safe lifecycle. |
| `src/features/desktop-agent/ui/AgentPickerPopover.tsx`, `AgentProviderPicker.tsx`, `AgentModelPicker.tsx` | `src/style/toolbar/model-selector.css`, chat model selector behavior | React listbox rewrite with click, Escape, outside click, arrows, Home/End, typeahead/search, focus return and `aria-disabled` inspectable local rows. Provider and Model remain separate controls. |
| `src/features/desktop-agent/ui/AgentComposer.tsx` | `src/style/components/input.css` | Adopts the compact bordered composer hierarchy; preserves PuppyOne attachment, context, mode, Send/Stop and security boundaries. |
| `src/features/desktop-agent/ui/desktop-agent.css` | `src/style/base/{variables,animations,container}.css`, `src/style/components/{messages,input,toolcalls,code,thinking}.css`, `src/style/features/diff.css`, `src/style/toolbar/model-selector.css` | Tokenized rewrite using only PuppyOne semantic colors, spacing and responsive container queries. No upstream branding or fixed theme palette. |

Claudian's imperative DOM renderer and hover-only model menu were not copied. PuppyOne keeps
React ownership, a maximum of 120 mounted transcript rows, explicit reduced-motion behavior and
the OpenCode-only Harness decision in ADR-003.
