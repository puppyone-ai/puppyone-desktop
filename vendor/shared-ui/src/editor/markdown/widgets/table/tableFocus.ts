/**
 * Compatibility shim. Table focus is editor-scoped StateField state
 * (see adapters/codemirror/tableFocusState.ts).
 */
export {
  clearPendingMarkdownTableFocus,
  focusMarkdownTableCell,
  queuePendingMarkdownTableFocus,
  restorePendingMarkdownTableFocus,
} from "../../adapters/codemirror/tableFocusState";
