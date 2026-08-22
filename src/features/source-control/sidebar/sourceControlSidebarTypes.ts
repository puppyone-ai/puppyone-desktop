import type { ReactNode } from "react";
import type { FileIconThemeId } from "@puppyone/shared-ui";
import type { GitDisplayMode } from "../../../preferences";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import type { GitMainPanel, GitWorkingSelection } from "../types";
import type { GitSidebarPanelId } from "./useGitSidebarPanelLayout";

export type GitSidebarRepositoryState = {
  status: GitStatusSnapshot | null;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  gitDisplayMode: GitDisplayMode;
  fileIconTheme: FileIconThemeId;
};

export type GitSidebarViewState = {
  activePanel: GitMainPanel;
  selectedWorkingFile: GitWorkingSelection | null;
  operationLoading: string | null;
  operationError: string | null;
  loading: boolean;
  error: string | null;
};

export type GitSidebarActions = {
  selectPanel: (panel: GitMainPanel) => void;
  selectWorkingFile: (selection: GitWorkingSelection) => void;
  stagePaths: (paths: string[]) => Promise<boolean>;
  stageAll: () => Promise<boolean>;
  unstagePaths: (paths: string[]) => Promise<boolean>;
  discardPaths: (paths: string[]) => Promise<boolean>;
  discardAll: () => Promise<boolean>;
  stageAndCommit: () => Promise<boolean>;
  commit: () => Promise<boolean>;
  commitAndPush: () => Promise<boolean>;
  continueOperation: () => Promise<boolean>;
  abortOperation: () => Promise<boolean>;
  pull: () => Promise<boolean>;
  push: () => Promise<boolean>;
  publish: () => Promise<boolean>;
};

export type GitSidebarCloudBackup = {
  loading: boolean;
  error: string | null;
  enabled?: boolean;
  start: () => void;
};

export type GitSidebarProps = {
  repository: GitSidebarRepositoryState;
  view: GitSidebarViewState;
  actions: GitSidebarActions;
  cloudBackup: GitSidebarCloudBackup;
};

/** Render-time panel configuration consumed only by the sidebar layout stack. */
export type GitSidebarRenderPanel = {
  id: GitSidebarPanelId;
  className: string;
  grow: number;
  expanded: boolean;
  headerRows?: 0 | 1;
  bodyRows: number;
  bodyChromePx?: number;
  content: ReactNode;
};
