import { Plus, Undo2 } from "lucide-react";
import {
  SidebarEmptyState,
  SidebarIconButton,
  type FileIconThemeId,
} from "@puppyone/shared-ui";
import type { MessageFormatter } from "@puppyone/localization";
import { SourceControlPreviewResourceList } from "../components";
import type {
  GitSidebarPrimaryActionKind,
  GitWorkingSelection,
  SourceControlSidebarModel,
} from "../types";
import {
  getCommittedSummary,
  type SourceControlPrimaryActionSlot,
} from "../viewModel";
import type { GitSidebarActions, GitSidebarRenderPanel } from "./sourceControlSidebarTypes";
import { SourceControlWorkingResourceList } from "./SourceControlResourceLists";
import { GitOperationButton } from "./GitSidebarPrimitives";
import { GitStatusCardSection } from "./GitStatusCardSection";
import { getGitSidebarPanelBodyRows } from "./useGitSidebarPanelLayout";
import type { GitSidebarExpansionState } from "./useGitSidebarExpansionState";

// Includes the context line and the status card's inset bottom padding so a
// fitted list does not produce fractional overflow or a phantom scrollbar.
const STATUS_CARD_CONTEXT_ROWS = 1.2;

type LocalPanelActions = Pick<
  GitSidebarActions,
  | "selectWorkingFile"
  | "stagePaths"
  | "stageAll"
  | "unstagePaths"
  | "discardPaths"
  | "discardAll"
  | "stageAndCommit"
  | "commit"
  | "commitAndPush"
  | "continueOperation"
  | "abortOperation"
  | "push"
  | "publish"
>;

/** Builds only local/committed status panels; provider and remote policy stay in the sidebar orchestrator. */
export function createGitLocalStatusPanels({
  model,
  expanded,
  disabled,
  operationLoading,
  fileIconTheme,
  selectedWorkingFile,
  primaryActionSlot,
  syncPushLabel,
  actions,
  t,
  onToggle,
}: {
  model: SourceControlSidebarModel;
  expanded: GitSidebarExpansionState;
  disabled: boolean;
  operationLoading: string | null;
  fileIconTheme: FileIconThemeId;
  selectedWorkingFile: GitWorkingSelection | null;
  primaryActionSlot: SourceControlPrimaryActionSlot;
  syncPushLabel: string;
  actions: LocalPanelActions;
  t: MessageFormatter;
  onToggle: (panel: "merge" | "committed" | "staged" | "unstaged") => void;
}): GitSidebarRenderPanel[] {
  const panels: GitSidebarRenderPanel[] = [];
  const primaryActionHandlers: Record<GitSidebarPrimaryActionKind, () => Promise<boolean>> = {
    commit: actions.commit,
    "commit-push": actions.commitAndPush,
    continue: actions.continueOperation,
    push: actions.push,
    publish: actions.publish,
  };

  if (model.hasConflicts || model.repositoryOperation) {
    const operationAction = model.operationPrimaryAction;
    panels.push({
      id: "merge",
      className: "merge",
      grow: 0.9,
      expanded: expanded.merge,
      bodyRows: getGitSidebarPanelBodyRows(model.mergeResources.length) + STATUS_CARD_CONTEXT_ROWS,
      content: (
        <GitStatusCardSection
          title={t(model.repositoryOperation ? "source-control.section.operation" : "source-control.section.merge")}
          count={model.mergeResources.length}
          context={model.sectionContext.merge}
          expanded={expanded.merge}
          onToggle={() => onToggle("merge")}
          action={model.repositoryOperation ? (
            <div className="desktop-git-section-actions">
              {model.repositoryOperation.canAbort && (
                <SidebarIconButton
                  className="desktop-git-abort-operation-action"
                  tone="danger"
                  label={t("source-control.sync.abort")}
                  disabled={disabled}
                  onClick={() => {
                    if (window.confirm(t("source-control.dialog.abortOperation"))) {
                      void actions.abortOperation();
                    }
                  }}
                  icon={<Undo2 size={13} />}
                />
              )}
              {operationAction && (
                <GitOperationButton
                  className="desktop-git-continue-operation-action"
                  title={operationAction.title}
                  disabled={disabled || operationAction.disabled}
                  icon={operationAction.icon}
                  label={operationAction.label}
                  loadingKey={operationAction.loadingKey}
                  loadingLabel={operationAction.loadingLabel}
                  operationLoading={operationLoading}
                  primary={primaryActionSlot === "operation"}
                  onClick={() => void primaryActionHandlers[operationAction.kind]()}
                />
              )}
            </div>
          ) : undefined}
        >
          {model.mergeResources.length > 0 ? (
            <SourceControlWorkingResourceList
              resources={model.mergeResources}
              selectedWorkingFile={selectedWorkingFile}
              operationLoading={operationLoading}
              fileIconTheme={fileIconTheme}
              onSelectWorkingFile={actions.selectWorkingFile}
              onStagePaths={actions.stagePaths}
              onUnstagePaths={actions.unstagePaths}
              onDiscardPaths={actions.discardPaths}
            />
          ) : null}
        </GitStatusCardSection>
      ),
    });
  }

  if (model.showCommittedSection) {
    const action = model.committedPrimaryAction;
    panels.push({
      id: "committed",
      className: "committed",
      grow: 1.05,
      expanded: expanded.committed,
      headerRows: 0,
      bodyRows: getGitSidebarPanelBodyRows(model.committedResources.length, true) + STATUS_CARD_CONTEXT_ROWS,
      content: (
        <GitStatusCardSection
          title={t("source-control.section.committed")}
          count={model.committedCount}
          context={model.sectionContext.committed}
          expanded={expanded.committed}
          onToggle={() => onToggle("committed")}
          showHeader={false}
          action={action ? (
            <GitOperationButton
              className="desktop-git-commit-push-action"
              title={action.title}
              disabled={disabled || action.disabled}
              icon={action.icon}
              label={action.label}
              loadingKey={action.loadingKey}
              loadingLabel={action.loadingLabel}
              operationLoading={operationLoading}
              primary={primaryActionSlot === "committed"}
              onClick={() => void primaryActionHandlers[action.kind]()}
            />
          ) : undefined}
        >
          {model.committedCount === 0 ? (
            <SidebarEmptyState compact className="desktop-git-section-empty">
              {t("source-control.status.empty")}
            </SidebarEmptyState>
          ) : model.committedResources.length > 0 ? (
            <SourceControlPreviewResourceList
              resources={model.committedResources}
              fileIconTheme={fileIconTheme}
              selectedWorkingFile={selectedWorkingFile}
              origin="committed"
              ariaLabel={t("source-control.preview.committed")}
              onSelectWorkingFile={actions.selectWorkingFile}
            />
          ) : (
            <div className="desktop-git-committed-summary" data-po-scrollbar="sidebar">
              {getCommittedSummary(model.committedCount, action?.label ?? syncPushLabel, t)}
            </div>
          )}
        </GitStatusCardSection>
      ),
    });
  }

  if (model.showStagedSection) {
    const action = model.stagedPrimaryAction;
    panels.push({
      id: "staged",
      className: "staged",
      grow: 0.9,
      expanded: expanded.staged,
      bodyRows: getGitSidebarPanelBodyRows(model.stagedResources.length, true) + STATUS_CARD_CONTEXT_ROWS,
      content: (
        <GitStatusCardSection
          title={t("source-control.section.staged")}
          count={model.stagedResources.length}
          context={model.sectionContext.staged}
          expanded={expanded.staged}
          onToggle={() => onToggle("staged")}
          action={action ? (
            <div className="desktop-git-section-actions">
              <GitOperationButton
                className="desktop-git-commit-push-action"
                title={action.title}
                disabled={disabled || action.disabled}
                icon={action.icon}
                label={action.label}
                loadingKey={action.loadingKey}
                loadingLabel={action.loadingLabel}
                operationLoading={operationLoading}
                primary={primaryActionSlot === "staged"}
                onClick={() => void primaryActionHandlers[action.kind]()}
              />
            </div>
          ) : undefined}
        >
          <SourceControlWorkingResourceList
            resources={model.stagedResources}
            selectedWorkingFile={selectedWorkingFile}
            operationLoading={operationLoading}
            fileIconTheme={fileIconTheme}
            onSelectWorkingFile={actions.selectWorkingFile}
            onStagePaths={actions.stagePaths}
            onUnstagePaths={actions.unstagePaths}
            onDiscardPaths={actions.discardPaths}
          />
        </GitStatusCardSection>
      ),
    });
  }

  if (model.showUnstagedSection) {
    panels.push({
      id: "unstaged",
      className: "unstaged",
      grow: 1.15,
      expanded: expanded.unstaged,
      bodyRows: getGitSidebarPanelBodyRows(model.localChangeResources.length, true) + STATUS_CARD_CONTEXT_ROWS,
      content: (
        <GitStatusCardSection
          title={t("source-control.section.unstaged")}
          count={model.localChangeResources.length}
          context={model.sectionContext.unstaged}
          expanded={expanded.unstaged}
          onToggle={() => onToggle("unstaged")}
          action={createUnstagedActions({ model, disabled, operationLoading, actions, primaryActionSlot, t })}
        >
          <SourceControlWorkingResourceList
            resources={model.localChangeResources}
            selectedWorkingFile={selectedWorkingFile}
            operationLoading={operationLoading}
            fileIconTheme={fileIconTheme}
            onSelectWorkingFile={actions.selectWorkingFile}
            onStagePaths={actions.stagePaths}
            onUnstagePaths={actions.unstagePaths}
            onDiscardPaths={actions.discardPaths}
          />
        </GitStatusCardSection>
      ),
    });
  }

  return panels;
}

function createUnstagedActions({
  model,
  disabled,
  operationLoading,
  actions,
  primaryActionSlot,
  t,
}: {
  model: SourceControlSidebarModel;
  disabled: boolean;
  operationLoading: string | null;
  actions: LocalPanelActions;
  primaryActionSlot: SourceControlPrimaryActionSlot;
  t: MessageFormatter;
}) {
  if (model.professionalMode) {
    if (model.workingResources.length === 0) return undefined;
    return (
      <div className="desktop-git-section-actions">
        <SidebarIconButton
          className="desktop-working-tree-revert-action"
          tone="danger"
          label={t("source-control.action.discardAll")}
          disabled={disabled}
          onClick={() => void actions.discardAll()}
          icon={<Undo2 size={13} />}
        />
        <SidebarIconButton
          className="desktop-git-stage-all-action"
          label={t("source-control.action.stageAll")}
          disabled={disabled}
          onClick={() => void actions.stageAll()}
          icon={<Plus size={13} />}
        />
      </div>
    );
  }

  if (!model.showSimpleChangeAction) return undefined;
  return (
    <div className="desktop-git-section-actions">
      {model.workingResources.length > 0 && (
        <SidebarIconButton
          className="desktop-working-tree-revert-action"
          tone="danger"
          label={t("source-control.action.discardAll")}
          disabled={disabled}
          onClick={() => void actions.discardAll()}
          icon={<Undo2 size={13} />}
        />
      )}
      <GitOperationButton
        className="desktop-git-commit-push-action desktop-git-stage-commit-action"
        title={t("source-control.action.stageCommitTitle")}
        disabled={disabled}
        icon="plus"
        label={t("source-control.action.stageCommit")}
        loadingKey="stage-commit"
        loadingLabel={t("source-control.action.committing")}
        operationLoading={operationLoading}
        primary={primaryActionSlot === "simple"}
        onClick={() => void actions.stageAndCommit()}
      />
    </div>
  );
}
