import type { MessageFormatter } from "@puppyone/localization";
import type { SourceControlSidebarModel } from "../types";
import type { SourceControlPrimaryActionSlot } from "../viewModel";
import type { GitSidebarActions } from "./sourceControlSidebarTypes";
import { GitOperationButton } from "./GitSidebarPrimitives";

export function GitSidebarCommitBar({
  model,
  repositoryReady,
  disabled,
  operationLoading,
  primaryActionSlot,
  actions,
  t,
}: {
  model: SourceControlSidebarModel;
  repositoryReady: boolean;
  disabled: boolean;
  operationLoading: string | null;
  primaryActionSlot: SourceControlPrimaryActionSlot;
  actions: Pick<GitSidebarActions, "commit" | "stageAndCommit">;
  t: MessageFormatter;
}) {
  const commitsStagedFiles = model.stagedResources.length > 0;
  const commitsWorkingFiles = !commitsStagedFiles && model.showStageAndCommitAction;
  const stagedAction = model.stagedPrimaryAction;
  const canCommit = commitsStagedFiles
    ? Boolean(stagedAction && !stagedAction.disabled)
    : commitsWorkingFiles;
  const buttonDisabled = disabled || !canCommit;
  const loadingKey = commitsStagedFiles ? "commit" : "stage-commit";
  const title = commitsStagedFiles
    ? stagedAction?.title ?? t("source-control.sync.commitStaged")
    : commitsWorkingFiles
      ? t("source-control.action.stageCommitTitle")
      : t("source-control.initial.clean");
  const isPrimary = primaryActionSlot === "staged" || primaryActionSlot === "stage-and-commit";
  const workingTreeClean = repositoryReady
    && model.stagedResources.length === 0
    && model.localChangeResources.length === 0
    && !model.hasConflicts
    && !model.repositoryOperation;

  return (
    <div className="desktop-git-commit-bar">
      <GitOperationButton
        className="desktop-git-primary-commit-action"
        title={title}
        disabled={buttonDisabled}
        icon="check"
        label={t("source-control.sync.commit")}
        loadingKey={loadingKey}
        loadingLabel={t("source-control.action.committing")}
        operationLoading={operationLoading}
        primary={isPrimary}
        onClick={() => {
          if (commitsStagedFiles) void actions.commit();
          else if (commitsWorkingFiles) void actions.stageAndCommit();
        }}
      />
      {workingTreeClean && (
        <span className="desktop-git-working-tree-clean">
          {t("source-control.initial.clean")}
        </span>
      )}
    </div>
  );
}
