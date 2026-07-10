# Markdown features

Each complex Markdown capability is a vertical slice. Keep its parser/model
refinement, plan compiler, commands, interaction state, rendering adapter, and
widget lifecycle in the same feature directory.

`blockFeatureRegistry.ts` and `inlineFeatureRegistry.ts` are the composition
boundary used by core decorations. Feature internals must not become a second
document model: every committed edit remains one CodeMirror transaction.
