import { StateEffect, StateField } from "@codemirror/state";

export type ExpandedImageRange = {
  from: number;
  to: number;
};

export const markdownExpandedImageEffect = StateEffect.define<ExpandedImageRange | null>();

export const markdownExpandedImageField = StateField.define<ExpandedImageRange | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(markdownExpandedImageEffect)) return effect.value;
    }

    const mapped = value
      ? {
          from: transaction.changes.mapPos(value.from),
          to: transaction.changes.mapPos(value.to),
        }
      : null;
    if (!mapped) return null;

    const selection = transaction.state.selection.main;
    if (selection.from >= mapped.from && selection.to <= mapped.to) return mapped;
    return null;
  },
});
