import type { FileIconThemeId, Workspace } from "@puppyone/shared-ui";
import type { GitDisplayMode, GitSidebarLayout } from "../../preferences";
import type { PuppyoneWorkspaceConfig } from "../../types/electron";
import { GitStatusView } from "./GitStatusView";
import { GitSidebar } from "./SourceControlSidebar";
import type { GitSidebarCloudBackup } from "./sidebar/sourceControlSidebarTypes";
import type { DesktopGitController } from "./useDesktopGitController";

export type SourceControlWorkspaceSurfaceProps = {
  controller: DesktopGitController;
  workspace: Workspace;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  gitDisplayMode: GitDisplayMode;
  gitSidebarLayout: GitSidebarLayout;
  fileIconTheme: FileIconThemeId;
  cloudBackup: GitSidebarCloudBackup;
  onOpenFile: (path: string) => void;
};

export function createSourceControlWorkspaceSurface({
  cloudBackup,
  controller,
  fileIconTheme,
  gitDisplayMode,
  gitSidebarLayout,
  onOpenFile,
  puppyoneConfig,
}: SourceControlWorkspaceSurfaceProps) {
  return {
    sidebar: (
      <GitSidebar
        repository={{
          status: controller.activeGitStatus,
          puppyoneConfig,
          gitDisplayMode,
          gitSidebarLayout,
          fileIconTheme,
        }}
        view={{
          selectedCommitId: controller.selectedGitCommitId,
          selectedWorkingFile: controller.selectedGitWorkingFile,
          historyLoading: controller.gitHistoryLoading,
          operationLoading: controller.gitOperationLoading,
          operationError: null,
          loading: controller.gitStatusLoading,
          error: controller.gitStatusError,
        }}
        actions={{
          selectCommit: controller.selectGitCommit,
          selectWorkingFile: controller.selectGitWorkingFile,
          stagePaths: controller.handleStageGitPaths,
          stageAll: controller.handleStageAllGitChanges,
          unstagePaths: controller.handleUnstageGitPaths,
          discardPaths: controller.handleDiscardGitPaths,
          discardAll: controller.handleDiscardAllGitChanges,
          stageAndCommit: controller.handleStageAndCommitGit,
          commit: controller.handleCommitGit,
          commitAndPush: controller.handleCommitAndPushGit,
          continueOperation: controller.handleContinueGitOperation,
          abortOperation: controller.handleAbortGitOperation,
          pull: controller.handlePullGit,
          push: controller.handlePushGit,
          publish: controller.handlePublishGitBranch,
        }}
        cloudBackup={cloudBackup}
      />
    ),
    main: (
      <GitStatusView
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
        onStagePaths={controller.handleStageGitPaths}
        onUnstagePaths={controller.handleUnstageGitPaths}
        onDiscardPaths={controller.handleDiscardGitPaths}
        onOpenWorkingFile={onOpenFile}
        onInitializeRepository={controller.handleInitializeGitRepository}
      />
    ),
  } as const;
}
