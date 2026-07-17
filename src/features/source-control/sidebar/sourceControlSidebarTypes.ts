import type { ReactNode } from "react";
import type { FileIconThemeId } from "@puppyone/shared-ui";
import type { GitDisplayMode } from "../../../preferences";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import type { GitMainPanel, GitWorkingSelection } from "../types";
import type { GitSidebarPanelId } from "./useGitSidebarPanelLayout";

export type GitSidebarProps = {
  status: GitStatusSnapshot | null;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  gitDisplayMode: GitDisplayMode;
  fileIconTheme: FileIconThemeId;
  activePanel: GitMainPanel;
  selectedWorkingFile: GitWorkingSelection | null;
  operationLoading: string | null;
  operationError: string | null;
  loading: boolean;
  error: string | null;
  onSelectPanel: (panel: GitMainPanel) => void;
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
  onStagePaths: (paths: string[]) => Promise<boolean>;
  onStageAll: () => Promise<boolean>;
  onUnstagePaths: (paths: string[]) => Promise<boolean>;
  onDiscardPaths: (paths: string[]) => Promise<boolean>;
  onDiscardAll: () => Promise<boolean>;
  onStageAndCommit: () => Promise<boolean>;
  onCommit: () => Promise<boolean>;
  onCommitAndPush: () => Promise<boolean>;
  onPull: () => Promise<boolean>;
  onPush: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  cloudBackupLoading: boolean;
  cloudBackupError: string | null;
  cloudEnabled?: boolean;
  onStartPuppyoneBackup: () => void;
};

export type GitSidebarPanel = {
  id: GitSidebarPanelId;
  className: string;
  grow: number;
  expanded: boolean;
  bodyRows: number;
  content: ReactNode;
};
