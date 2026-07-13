import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type MarkdownTaskCheckboxTarget = Readonly<{
  from: number;
  to: number;
}>;

const TASK_CHECKBOX_TOKEN = /^\[[ xX]\]$/;

/**
 * Toggles a task marker against the current EditorState rather than trusting
 * the widget's render-time checked value. That keeps repeated input and
 * mapped widgets deterministic while limiting projection work to one token.
 */
export function toggleMarkdownTaskCheckbox(
  view: EditorView,
  target: MarkdownTaskCheckboxTarget,
): boolean {
  if (view.state.readOnly) return false;
  if (target.from < 0 || target.to > view.state.doc.length || target.from >= target.to) return false;

  const currentToken = view.state.sliceDoc(target.from, target.to);
  if (!TASK_CHECKBOX_TOKEN.test(currentToken)) return false;

  const checked = currentToken[1]?.toLowerCase() === "x";
  view.dispatch({
    changes: {
      from: target.from,
      to: target.to,
      insert: checked ? "[ ]" : "[x]",
    },
    annotations: Transaction.userEvent.of("input.task.toggle"),
  });
  return true;
}
