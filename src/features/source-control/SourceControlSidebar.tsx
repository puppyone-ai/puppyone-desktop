import { Plus, Undo2 } from "lucide-react";
import {
  SidebarEmptyState,
  SidebarIconButton,
  SidebarRoot,
  SidebarScrollArea,
} from "@puppyone/shared-ui";
import { Fragment, useMemo, useState } from "react";
import { useLocalization } from "@puppyone/localization";
import {
  SourceControlPreviewResourceList,
  SourceControlSectionHeader,
} from "./components";
import {
  buildSourceControlSidebarModel,
  getGitHostingIdentity,
  getGitHostingMode,
  getGitScmSyncSection,
  getSourceControlPrimaryActionSlot,
  getGitSyncState,
} from "./viewModel";
import {
  getGitSidebarPanelBodyRows,
  useGitSidebarPanelLayout,
} from "./sidebar/useGitSidebarPanelLayout";
import {
  GitHistoryShortcut,
  GitHostingIdentityRow,
  GitOperationButton,
  GitRemotePrompt,
  GitScmSyncRow,
  GitSectionCollapse,
  GitSidebarSectionResizer,
  PuppyoneCloudProviderSection,
  getCommittedSummary,
} from "./sidebar/SourceControlSidebarSections";
import { SourceControlWorkingResourceList } from "./sidebar/SourceControlResourceLists";
import type { GitSidebarPanel, GitSidebarProps } from "./sidebar/sourceControlSidebarTypes";
export type { GitSidebarProps } from "./sidebar/sourceControlSidebarTypes";
export function GitSidebar({
  status,
  puppyoneConfig,
  gitDisplayMode,
  fileIconTheme,
  activePanel,
  selectedWorkingFile,
  operationLoading,
  operationError,
  loading,
  error,
  onSelectPanel,
  onSelectWorkingFile,
  onStagePaths,
  onStageAll,
  onUnstagePaths,
  onDiscardPaths,
  onDiscardAll,
  onStageAndCommit,
  onCommit,
  onCommitAndPush,
  onPull,
  onPush,
  onPublish,
  cloudBackupLoading,
  cloudBackupError,
  cloudEnabled = true,
  onStartPuppyoneBackup,
}: GitSidebarProps) {
  const { t, formatNumber } = useLocalization();
  const [backupCardDismissed, setBackupCardDismissed] = useState(false);
  const [remoteExpanded, setRemoteExpanded] = useState(true);
  const [mergeExpanded, setMergeExpanded] = useState(true);
  const [committedExpanded, setCommittedExpanded] = useState(true);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [workingExpanded, setWorkingExpanded] = useState(true);
  const sourceControl = status?.sourceControl ?? null;
  const historyCommits = status?.allCommits ?? status?.commits ?? [];
  const currentBranch = status?.branches.find((branch) => branch.current) ?? null;
  const syncState = getGitSyncState(status, currentBranch, puppyoneConfig, t);
  const hostingMode = getGitHostingMode(status, puppyoneConfig);
  const hostingIdentity = getGitHostingIdentity(status, puppyoneConfig);
  const showRemoteSyncSection = hostingMode === "generic-git";
  const professionalDisplayMode = hostingMode === "github" || hostingMode === "puppyone-cloud";
  const historyCount = historyCommits.length || status?.totalCommits || 0;
  const disabled = Boolean(operationLoading) || loading || !status?.isRepo;
  const canCommit = sourceControl?.actions.canCommit === true;
  const {
    professionalMode,
    mergeResources,
    stagedResources,
    workingResources,
    localChangeResources,
    committedCount,
    committedResources,
    committedPrimaryAction,
    showCommittedSection,
    stagedPrimaryAction,
    showSimpleChangeAction,
  } = buildSourceControlSidebarModel({
    status,
    syncState,
    displayMode: professionalDisplayMode ? "professional" : gitDisplayMode,
    canCommit,
    t,
  });
  const remoteSection = showRemoteSyncSection && !syncState.setupRequired ? getGitScmSyncSection(status, syncState, t) : null;
  const cloudSyncActionAvailable = hostingMode === "puppyone-cloud"
    && status?.sourceControl.remote?.canPull === true
    && mergeResources.length === 0;
  const primaryActionSlot = getSourceControlPrimaryActionSlot({
    hasStagedAction: professionalMode && Boolean(stagedPrimaryAction && !stagedPrimaryAction.disabled),
    hasSyncAction: cloudSyncActionAvailable || Boolean(remoteSection?.action && !remoteSection.action.disabled),
    hasCommittedAction: Boolean(committedPrimaryAction && !committedPrimaryAction.disabled),
    hasSimpleAction: !professionalMode && showSimpleChangeAction,
  });
  const providerSlot = hostingMode === "puppyone-cloud" ? (
    <PuppyoneCloudProviderSection
      status={status}
      mergeCount={mergeResources.length}
      fileIconTheme={fileIconTheme}
      selectedWorkingFile={selectedWorkingFile}
      disabled={disabled}
      operationLoading={operationLoading}
      primaryAction={primaryActionSlot === "sync"}
      onSelectWorkingFile={onSelectWorkingFile}
      onPull={onPull}
    />
  ) : hostingIdentity ? (
    <GitHostingIdentityRow identity={hostingIdentity} />
  ) : null;

  const scrollableContentRevision = useMemo(() => ({
    committedExpanded,
    loading,
    mergeExpanded,
    remoteExpanded,
    stagedExpanded,
    status,
    workingExpanded,
  }), [
    committedExpanded,
    loading,
    mergeExpanded,
    remoteExpanded,
    stagedExpanded,
    status,
    workingExpanded,
  ]);
  const {
    activeResizeSplit,
    beginPanelResize,
    getPanelStyle,
    resizePanelsByKeyboard,
    setPanelRef,
    sidebarListRef,
  } = useGitSidebarPanelLayout(scrollableContentRevision);

  const panels: GitSidebarPanel[] = [];

  if (remoteSection) {
    panels.push({
      id: "remote",
      className: "remote",
      grow: 1.05,
      expanded: remoteExpanded,
      bodyRows: getGitSidebarPanelBodyRows(remoteSection?.previewResources.length ?? 0, Boolean(remoteSection?.fallbackSummary)),
      content: (
        <GitScmSyncRow
          status={status}
          state={syncState}
          fileIconTheme={fileIconTheme}
          expanded={remoteExpanded}
          selectedWorkingFile={selectedWorkingFile}
          disabled={disabled}
          operationLoading={operationLoading}
          primaryAction={primaryActionSlot === "sync"}
          onToggleExpanded={() => setRemoteExpanded((expanded) => !expanded)}
          onSelectWorkingFile={onSelectWorkingFile}
          onPull={onPull}
          onPush={onPush}
          onPublish={onPublish}
        />
      ),
    });
  }

  if (mergeResources.length > 0) {
    panels.push({
      id: "merge",
      className: "merge",
      grow: 0.9,
      expanded: mergeExpanded,
      bodyRows: getGitSidebarPanelBodyRows(mergeResources.length),
      content: (
        <>
          <SourceControlSectionHeader
            title={t("source-control.section.merge")}
            count={mergeResources.length}
            expanded={mergeExpanded}
            onToggle={() => setMergeExpanded((expanded) => !expanded)}
          />
          <GitSectionCollapse expanded={mergeExpanded}>
            <SourceControlWorkingResourceList
              resources={mergeResources}
              selectedWorkingFile={selectedWorkingFile}
              operationLoading={operationLoading}
              fileIconTheme={fileIconTheme}
              onSelectWorkingFile={onSelectWorkingFile}
              onStagePaths={onStagePaths}
              onUnstagePaths={onUnstagePaths}
              onDiscardPaths={onDiscardPaths}
            />
          </GitSectionCollapse>
        </>
      ),
    });
  }

  if (showCommittedSection) {
    panels.push({
      id: "committed",
      className: "committed",
      grow: 1.05,
      expanded: committedExpanded,
      bodyRows: getGitSidebarPanelBodyRows(committedResources.length, true),
      content: (
        <>
          <SourceControlSectionHeader
            title={t("source-control.section.committed")}
            count={committedCount}
            highlightCount={committedCount > 0}
            expanded={committedExpanded}
            onToggle={() => setCommittedExpanded((expanded) => !expanded)}
            action={committedPrimaryAction ? (
              <GitOperationButton
                className="desktop-git-commit-push-action"
                title={committedPrimaryAction.title}
                disabled={disabled || committedPrimaryAction.disabled}
                icon={committedPrimaryAction.icon}
                label={committedPrimaryAction.label}
                loadingKey={committedPrimaryAction.loadingKey}
                loadingLabel={committedPrimaryAction.loadingLabel}
                operationLoading={operationLoading}
                primary={primaryActionSlot === "committed"}
                onClick={() => {
                  if (committedPrimaryAction.kind === "push") void onPush();
                  if (committedPrimaryAction.kind === "publish") void onPublish();
                }}
              />
            ) : null}
          />
          <GitSectionCollapse expanded={committedExpanded}>
            {committedCount === 0 ? (
              <SidebarEmptyState compact className="desktop-git-section-empty">{t("source-control.status.empty")}</SidebarEmptyState>
            ) : committedResources.length > 0 ? (
              <SourceControlPreviewResourceList
                resources={committedResources}
                fileIconTheme={fileIconTheme}
                selectedWorkingFile={selectedWorkingFile}
                origin="committed"
                ariaLabel={t("source-control.preview.committed")}
                onSelectWorkingFile={onSelectWorkingFile}
              />
            ) : (
              <div className="desktop-git-committed-summary">
                {getCommittedSummary(committedCount, committedPrimaryAction?.label ?? syncState.pushLabel, t)}
              </div>
            )}
          </GitSectionCollapse>
        </>
      ),
    });
  }

  if (professionalMode) {
    panels.push({
      id: "staged",
      className: "staged",
      grow: 0.9,
      expanded: stagedExpanded,
      bodyRows: getGitSidebarPanelBodyRows(stagedResources.length, true),
      content: (
        <>
          <SourceControlSectionHeader
            title={t("source-control.section.staged")}
            count={stagedResources.length}
            expanded={stagedExpanded}
            onToggle={() => setStagedExpanded((expanded) => !expanded)}
            action={stagedPrimaryAction ? (
              <div className="desktop-git-section-actions">
                <GitOperationButton
                  className="desktop-git-commit-push-action"
                  title={stagedPrimaryAction.title}
                  disabled={disabled || stagedPrimaryAction.disabled}
                  icon={stagedPrimaryAction.icon}
                  label={stagedPrimaryAction.label}
                  loadingKey={stagedPrimaryAction.loadingKey}
                  loadingLabel={stagedPrimaryAction.loadingLabel}
                  operationLoading={operationLoading}
                  primary={primaryActionSlot === "staged"}
                  onClick={() => {
                    if (stagedPrimaryAction.kind === "commit") void onCommit();
                    if (stagedPrimaryAction.kind === "commit-push") void onCommitAndPush();
                    if (stagedPrimaryAction.kind === "push") void onPush();
                    if (stagedPrimaryAction.kind === "publish") void onPublish();
                  }}
                />
              </div>
            ) : null}
          />
          <GitSectionCollapse expanded={stagedExpanded}>
            {stagedResources.length === 0 ? (
              <SidebarEmptyState compact className="desktop-git-section-empty">{t("source-control.status.empty")}</SidebarEmptyState>
            ) : (
              <SourceControlWorkingResourceList
                resources={stagedResources}
                selectedWorkingFile={selectedWorkingFile}
                operationLoading={operationLoading}
                fileIconTheme={fileIconTheme}
                onSelectWorkingFile={onSelectWorkingFile}
                onStagePaths={onStagePaths}
                onUnstagePaths={onUnstagePaths}
                onDiscardPaths={onDiscardPaths}
              />
            )}
          </GitSectionCollapse>
        </>
      ),
    });
  }

  panels.push({
    id: "unstaged",
    className: "unstaged",
    grow: 1.15,
    expanded: workingExpanded,
    bodyRows: getGitSidebarPanelBodyRows(localChangeResources.length, true),
    content: (
      <>
        <SourceControlSectionHeader
          title={t("source-control.section.unstaged")}
          count={localChangeResources.length}
          expanded={workingExpanded}
          onToggle={() => setWorkingExpanded((expanded) => !expanded)}
          action={professionalMode ? (
            workingResources.length > 0 ? (
              <div className="desktop-git-section-actions">
                <SidebarIconButton
                  className="desktop-working-tree-revert-action"
                  tone="danger"
                  label={t("source-control.action.discardAll")}
                  disabled={disabled}
                  onClick={() => void onDiscardAll()}
                  icon={<Undo2 size={13} />}
                />
                <SidebarIconButton
                  className="desktop-git-stage-all-action"
                  label={t("source-control.action.stageAll")}
                  disabled={disabled}
                  onClick={() => void onStageAll()}
                  icon={<Plus size={13} />}
                />
              </div>
            ) : null
          ) : showSimpleChangeAction ? (
            <div className="desktop-git-section-actions">
              {workingResources.length > 0 && (
                <SidebarIconButton
                  className="desktop-working-tree-revert-action"
                  tone="danger"
                  label={t("source-control.action.discardAll")}
                  disabled={disabled}
                  onClick={() => void onDiscardAll()}
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
                onClick={() => void onStageAndCommit()}
              />
            </div>
          ) : null}
        />
        <GitSectionCollapse expanded={workingExpanded}>
          {localChangeResources.length === 0 ? (
            <SidebarEmptyState compact className="desktop-git-section-empty">{t("source-control.status.empty")}</SidebarEmptyState>
          ) : (
            <SourceControlWorkingResourceList
              resources={localChangeResources}
              selectedWorkingFile={selectedWorkingFile}
              operationLoading={operationLoading}
              fileIconTheme={fileIconTheme}
              onSelectWorkingFile={onSelectWorkingFile}
              onStagePaths={onStagePaths}
              onUnstagePaths={onUnstagePaths}
              onDiscardPaths={onDiscardPaths}
            />
          )}
        </GitSectionCollapse>
      </>
    ),
  });

  return (
    <SidebarRoot className="desktop-git-sidebar">
      <SidebarScrollArea ref={sidebarListRef} className="desktop-git-sidebar-list">
        {error ? (
          <SidebarEmptyState tone="danger">{error}</SidebarEmptyState>
        ) : status && !status.isRepo ? (
          <SidebarEmptyState layout={operationError ? "vertical" : "inline"}>
            <span>{t("source-control.status.noRepository")}</span>
            {operationError && <small className="po-sidebar-error-text">{operationError}</small>}
          </SidebarEmptyState>
        ) : loading && !status ? (
          <SidebarEmptyState>{t("source-control.status.readingGit")}</SidebarEmptyState>
        ) : (
          <>
            <div className="desktop-git-fixed-region">
              {providerSlot}

              <GitRemotePrompt
                state={syncState}
                disabled={disabled}
                cloudBackupLoading={cloudBackupLoading}
                cloudBackupError={cloudBackupError}
                dismissed={backupCardDismissed}
                cloudEnabled={cloudEnabled}
                onDismiss={() => setBackupCardDismissed(true)}
                onStartPuppyoneBackup={onStartPuppyoneBackup}
              />

              {operationError && (
                <div className="desktop-git-operation-error" role="alert">
                  {operationError}
                </div>
              )}
              {status?.didHitStatusLimit && (
                <div className="desktop-git-status-limit-warning" role="status">
                  {t("source-control.status.limit", { count: formatNumber(status.statusLimit) })}
                </div>
              )}
            </div>

            <div className="desktop-git-resizable-stack">
              {panels.map((panel, index) => (
                <Fragment key={panel.id}>
                  {index > 0 && (
                    <GitSidebarSectionResizer
                      previous={panels[index - 1].id}
                      next={panel.id}
                      active={activeResizeSplit === `${panels[index - 1].id}:${panel.id}`}
                      onPointerDown={beginPanelResize}
                      onKeyboardResize={resizePanelsByKeyboard}
                    />
                  )}
                  <div
                    ref={(node) => setPanelRef(panel.id, node)}
                    className={`desktop-git-resizable-section desktop-git-resizable-section-${panel.className} ${panel.expanded ? "expanded" : "collapsed"}`}
                    style={getPanelStyle(panel)}
                  >
                    {panel.content}
                  </div>
                </Fragment>
              ))}
            </div>

            <GitHistoryShortcut
              active={activePanel === "history"}
              count={historyCount}
              onSelect={() => onSelectPanel("history")}
            />
          </>
        )}
      </SidebarScrollArea>
    </SidebarRoot>
  );
}
