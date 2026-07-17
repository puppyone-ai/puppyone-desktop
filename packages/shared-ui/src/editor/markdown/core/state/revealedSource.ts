import { StateEffect, StateField } from "@codemirror/state";

export type MarkdownRevealedSourceRange = {
  from: number;
  to: number;
  presentation: "inline" | "block";
};

/**
 * Explicitly exposes one canonical Markdown source range in the main
 * CodeMirror document. Widgets never own a second editable source copy.
 */
export const markdownRevealedSourceEffect = StateEffect.define<MarkdownRevealedSourceRange | null>();

export const markdownRevealedSourceField = StateField.define<MarkdownRevealedSourceRange | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(markdownRevealedSourceEffect)) return effect.value;
    }

    if (!value) return null;
    const mapped = {
      from: transaction.changes.mapPos(value.from, -1),
      to: transaction.changes.mapPos(value.to, 1),
      presentation: value.presentation,
    } satisfies MarkdownRevealedSourceRange;
    const selection = transaction.state.selection.main;
    return selection.from >= mapped.from && selection.to <= mapped.to
      ? mapped
      : null;
  },
});
