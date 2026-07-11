export type EditorSourceSnapshot = {
  content: string;
  revision: string;
};

export type EditorSourceRevision = {
  revision: string;
  dirty: boolean;
};

/**
 * Imperative, read-only persistence boundary for editors whose canonical
 * source lives outside React state. Reading a snapshot is intentionally
 * explicit because it may copy the complete document.
 */
export type EditorSourceSnapshotPort = {
  readSnapshot: () => EditorSourceSnapshot;
  readRevision: () => string;
};
