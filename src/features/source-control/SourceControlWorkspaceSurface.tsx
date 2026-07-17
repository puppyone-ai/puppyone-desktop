import type { FileIconThemeId, Workspace } from "@puppyone/shared-ui";
import type { GitDisplayMode } from "../../preferences";
import type { PuppyoneWorkspaceConfig } from "../../types/electron";
import { GitStatusView } from "./GitStatusView";
import { GitSidebar } from "./SourceControlSidebar";
import type { DesktopGitController } from "./useDesktopGitController";

export type SourceControlWorkspaceSurfaceProps = {
  controller: DesktopGitController;
  workspace: Workspace;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  gitDisplayMode: GitDisplayMode;
  fileIconTheme: FileIconThemeId;
  cloudBackup: {
    loading: boolean;
    error: string | null;
    enabled: boolean;
    start: () => void;
  };
  onOpenFile: (path: string) => void;
};

export function createSourceControlWorkspaceSurface({
  cloudBackup,
  controller,
  fileIconTheme,
  gitDisplayMode,
  onOpenFile,
  puppyoneConfig,
  workspace,
}: SourceControlWorkspaceSurfaceProps) {
  return {
    sidebar: (
      <GitSidebar
        status={controller.activeGitStatus}
        puppyoneConfig={puppyoneConfig}
        gitDisplayMode={gitDisplayMode}
        fileIconTheme={fileIconTheme}
        activePanel={controller.gitMainPanel}
        loading={controller.gitStatusLoading}
        error={controller.gitStatusError}
        selectedWorkingFile={controller.selectedGitWorkingFile}
        operationLoading={controller.gitOperationLoading}
        operationError={null}
        onSelectPanel={controller.selectGitMainPanel}
        onSelectWorkingFile={controller.selectGitWorkingFile}
        onStagePaths={controller.handleStageGitPaths}
        onStageAll={controller.handleStageAllGitChanges}
        onUnstagePaths={controller.handleUnstageGitPaths}
        onDiscardPaths={controller.handleDiscardGitPaths}
        onDiscardAll={controller.handleDiscardAllGitChanges}
        onStageAndCommit={controller.handleStageAndCommitGit}
        onCommit={controller.handleCommitGit}
        onCommitAndPush={controller.handleCommitAndPushGit}
        onPull={controller.handlePullGit}
        onPush={controller.handlePushGit}
        onPublish={controller.handlePublishGitBranch}
        cloudBackupLoading={cloudBackup.loading}
        cloudBackupError={cloudBackup.error}
        cloudEnabled={cloudBackup.enabled}
        onStartPuppyoneBackup={cloudBackup.start}
      />
    ),
    main: (
      <GitStatusView
        workspace={workspace}
        status={controller.activeGitStatus}
        activePanel={controller.gitMainPanel}
        selectedCommitId={controller.selectedGitCommitId}
        selectedWorkingFile={controller.selectedGitWorkingFile}
        commitDetail={controller.gitCommitDetail}
        commitDetailLoading={controller.gitCommitDetailLoading}
        commitDetailError={controller.gitCommitDetailError}
        workingFileDiff={controller.gitWorkingFileDiff}
        workingFileDiffLoading={controller.gitWorkingFileDiffLoading}
        workingFileDiffError={controller.gitWorkingFileDiffError}
        operationLoading={controller.gitOperationLoading}
        operationError={null}
        loading={controller.gitStatusLoading}
        error={controller.gitStatusError}
        onRefresh={controller.refreshGitStatus}
        onSelectCommit={controller.selectGitCommit}
        onStagePaths={controller.handleStageGitPaths}
        onUnstagePaths={controller.handleUnstageGitPaths}
        onDiscardPaths={controller.handleDiscardGitPaths}
        onOpenWorkingFile={onOpenFile}
        onInitializeRepository={controller.handleInitializeGitRepository}
      />
    ),
  } as const;
}
