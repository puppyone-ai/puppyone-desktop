export const DOCX_REDLINE_RENDERER_VERSION = "3";

export type DocxBlockKind = "paragraph" | "heading" | "list-item" | "table-row";

export type DocxNormalizedBlock = {
  kind: DocxBlockKind;
  text: string;
  cells?: string[];
  sourceIndex: number;
};

export type DocxRedlineSegment = {
  kind: "equal" | "add" | "remove";
  text: string;
};

export type DocxRedlineChange = {
  id: string;
  kind: "added" | "deleted" | "modified";
  blockKind: DocxBlockKind;
  beforeIndex: number | null;
  afterIndex: number | null;
  segments: DocxRedlineSegment[];
};

export type DocxRedlinePresentation = {
  kind: "docx-redline";
  rendererVersion: string;
  state: "ready" | "added" | "deleted" | "empty";
  stats: {
    blocksAdded: number;
    blocksDeleted: number;
    blocksModified: number;
    blocksChanged: number;
    wordsAdded: number;
    wordsDeleted: number;
  };
  changes: DocxRedlineChange[];
  truncated: boolean;
  fidelity: "body-text-v1";
};
