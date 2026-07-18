import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const markdownLivePreviewFocusEffect = StateEffect.define<boolean>();

/**
 * Dispatchable counterpart to EditorView.focusChangeEffect.  Keeping this
 * exported lets deterministic benchmarks and integration tests exercise the
 * exact focus/reveal invalidation path without synthesising browser focus.
 */
export function setMarkdownLivePreviewFocus(focused: boolean) {
  return markdownLivePreviewFocusEffect.of(focused);
}

export const markdownLivePreviewFocusExtension = EditorView.focusChangeEffect.of((_state, focusing) => (
  markdownLivePreviewFocusEffect.of(focusing)
));

export function getLivePreviewFocusState(focused: boolean, effects: readonly StateEffect<unknown>[]): boolean {
  for (const effect of effects) {
    if (effect.is(markdownLivePreviewFocusEffect)) return effect.value;
  }
  return focused;
}
