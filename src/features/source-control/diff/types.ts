import type { ComponentType } from "react";
import type { FileFormat } from "@puppyone/shared-ui";
import type { GitFileDiff } from "../../../types/electron";

export type DiffSourceRequirement =
  | "git-patch"
  | "text-pair"
  | "resource-pair"
  | "metadata";

export type BuiltInDiffViewerId = "docx-redline" | "text-unified" | "binary-summary";

export type DiffRendererProps = {
  file: GitFileDiff;
  format: FileFormat;
  canOpenFile?: boolean;
  onOpenFile?: (path: string) => void;
};

export type DiffViewerContribution = {
  id: BuiltInDiffViewerId;
  version: string;
  source: DiffSourceRequirement;
  match(input: { file: GitFileDiff; format: FileFormat }): boolean;
  render: ComponentType<DiffRendererProps>;
};

export type ResolvedDiffViewer = {
  id: BuiltInDiffViewerId;
  version: string;
  source: DiffSourceRequirement;
  format: FileFormat;
  contribution: DiffViewerContribution;
};
