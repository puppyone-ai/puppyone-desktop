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

export type CommitResult = {
  ok: boolean;
  mappedTo: SourceRange | null;
};

/**
 * Returns a stable, cheap document revision string.
 * Format: `${length}:${lines}`. Callers embed this when snapshotting
 * a base range so the broker can detect doc-level changes quickly.
 */
export function getDocRevision(doc: { length: number; lines: number }): string {
  return `${doc.length}:${doc.lines}`;
}

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

      // An embedded session is a snapshot. Do not silently commit a draft once
      // the document revision has changed, even when the mapped text happens to
      // match: the surrounding syntax may have changed concurrently.
      if (request.baseRevision !== getDocRevision(view.state.doc)) return null;

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

    commit(view: EditorView, request: EmbeddedCommitRequest): CommitResult {
      if (view.state.readOnly) return { ok: false, mappedTo: null };

      const currentRevision = getDocRevision(view.state.doc);
      const current = view.state.sliceDoc(request.mappedRange.from, request.mappedRange.to);

      // Embedded drafts are only valid against the exact document snapshot that
      // created them. Range mapping preserves location for recovery/UI, but it
      // does not make a stale draft safe to commit.
      if (request.baseRevision !== currentRevision) {
        return { ok: false, mappedTo: null };
      }

      if (current !== request.baseSource) {
        return { ok: false, mappedTo: null };
      }

      const newTo = request.mappedRange.from + request.nextSource.length;
      const selection = request.selection
        ? EditorSelection.range(request.selection.from, request.selection.to)
        : EditorSelection.cursor(newTo);

      const spec: TransactionSpec = {
        changes: {
          from: request.mappedRange.from,
          to: request.mappedRange.to,
          insert: request.nextSource,
        },
        selection,
      };

      view.dispatch(spec);
      return { ok: true, mappedTo: { from: request.mappedRange.from, to: newTo } };
    },
  };
}

export type TransactionBroker = ReturnType<typeof createTransactionBroker>;
