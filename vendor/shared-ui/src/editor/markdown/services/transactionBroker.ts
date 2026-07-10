import { EditorSelection, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SourceRange } from "../plans/markdownPlanTypes";

export type EmbeddedCommitRequest = {
  mappedRange: SourceRange;
  baseSource: string;
  baseRevision: string;
  nextSource: string;
  selection?: { from: number; to: number };
};

/**
 * Validates an embedded edit session's base revision/source and builds a
 * single CodeMirror transaction that commits source + mapped selection.
 */
export function createTransactionBroker() {
  return {
    buildCommit(view: EditorView, request: EmbeddedCommitRequest): TransactionSpec | null {
      if (view.state.readOnly) return null;

      const current = view.state.sliceDoc(request.mappedRange.from, request.mappedRange.to);
      if (current !== request.baseSource) {
        // External/Agent edit conflict: refuse silent overwrite.
        return null;
      }

      const selection = request.selection
        ? EditorSelection.range(request.selection.from, request.selection.to)
        : EditorSelection.cursor(request.mappedRange.from + request.nextSource.length);

      return {
        changes: {
          from: request.mappedRange.from,
          to: request.mappedRange.to,
          insert: request.nextSource,
        },
        selection,
      };
    },

    commit(view: EditorView, request: EmbeddedCommitRequest): boolean {
      const spec = this.buildCommit(view, request);
      if (!spec) return false;
      view.dispatch(spec);
      return true;
    },
  };
}

export type TransactionBroker = ReturnType<typeof createTransactionBroker>;
