export type EditorSourceSnapshot = {
  content: string;
  revision: string;
};

export type EditorSourceRevision = {
  revision: string;
  dirty: boolean;
};

/**
 * Imperative content boundary for editors whose canonical source lives
 * outside React state. Snapshot reads are explicit because they may copy the
 * complete document; replacement routes an accepted external version back
 * through the format-specific model.
 */
export type EditorSourceSnapshotPort = {
  readSnapshot: () => EditorSourceSnapshot;
  /** Apply raw canonical file content through the format-specific model. */
  replaceContent: (content: string) => EditorSourceSnapshot;
};
