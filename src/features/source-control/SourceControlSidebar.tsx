import {
  SidebarEmptyState,
  SidebarRoot,
  SidebarScrollArea,
} from "@puppyone/shared-ui";
import { Fragment, useMemo, useState } from "react";
import { useLocalization } from "@puppyone/localization";
import {
  buildSourceControlSidebarModel,
  getGitHostingIdentity,
  getGitHostingMode,
  getGitScmSyncSection,
  getSourceControlPrimaryActionSlot,
  getGitSyncState,
} from "./viewModel";
import { createGitLocalStatusPanels } from "./sidebar/GitLocalStatusPanels";
import {
  GitHistoryShortcut,
  GitSidebarSectionResizer,
} from "./sidebar/GitSidebarPrimitives";
import {
  GitHubProviderSection,
  PuppyoneCloudProviderSection,
} from "./sidebar/GitSidebarProviders";
import {
  GitRemotePrompt,
  GitScmSyncRow,
} from "./sidebar/GitRemoteSections";
import type {
  GitSidebarProps,
  GitSidebarRenderPanel,
} from "./sidebar/sourceControlSidebarTypes";
import { useGitSidebarExpansionState } from "./sidebar/useGitSidebarExpansionState";
import {
  getGitSidebarPanelBodyRows,
  useGitSidebarPanelLayout,
} from "./sidebar/useGitSidebarPanelLayout";

export type { GitSidebarProps } from "./sidebar/sourceControlSidebarTypes";

export function GitSidebar({ repository, view, actions, cloudBackup }: GitSidebarProps) {
  const { status, puppyoneConfig, gitDisplayMode, gitSidebarLayout, fileIconTheme } = repository;
  const {
    activePanel,
    selectedWorkingFile,
    operationLoading,
    operationError,
    loading,
    error,
  } = view;
  const { selectPanel, selectWorkingFile, pull, push, publish } = actions;
  const { t, formatNumber } = useLocalization();
  const [backupCardDismissed, setBackupCardDismissed] = useState(false);
  const { expanded, toggle } = useGitSidebarExpansionState();
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
  const sidebarModel = buildSourceControlSidebarModel({
    status,
    syncState,
    displayMode: professionalDisplayMode ? "professional" : gitDisplayMode,
    canCommit: sourceControl?.actions.canCommit === true,
    t,
  });
  const remoteSection = showRemoteSyncSection && !syncState.setupRequired
    ? getGitScmSyncSection(status, syncState, t, { blockedByConflicts: sidebarModel.hasConflicts })
    : null;
  const githubSection = hostingMode === "github" && !syncState.setupRequired
    ? getGitScmSyncSection(status, syncState, t, { blockedByConflicts: sidebarModel.hasConflicts })
    : null;
  const cloudSyncActionAvailable = hostingMode === "puppyone-cloud"
    && status?.sourceControl.remote?.canPull === true
    && sidebarModel.mergeResources.length === 0;
  const githubSyncActionAvailable = githubSection?.action?.kind === "pull"
    && githubSection.action.disabled === false
    && sidebarModel.mergeResources.length === 0;
  const primaryActionSlot = getSourceControlPrimaryActionSlot({
    hasConflicts: sidebarModel.hasConflicts,
    hasOperationAction: Boolean(sidebarModel.operationPrimaryAction),
    hasStagedAction: Boolean(
      sidebarModel.stagedPrimaryAction && !sidebarModel.stagedPrimaryAction.disabled,
    ),
    hasSyncAction: cloudSyncActionAvailable
      || githubSyncActionAvailable
      || Boolean(remoteSection?.action && !remoteSection.action.disabled),
    hasCommittedAction: Boolean(
      sidebarModel.committedPrimaryAction && !sidebarModel.committedPrimaryAction.disabled,
    ),
    hasStageAndCommitAction: sidebarModel.showStageAndCommitAction,
  });
  const providerSlot = hostingMode === "puppyone-cloud" ? (
    <PuppyoneCloudProviderSection
      status={status}
      mergeCount={sidebarModel.mergeResources.length}
      disabled={disabled}
      operationLoading={operationLoading}
      primaryAction={primaryActionSlot === "sync"}
      onPull={pull}
    />
  ) : hostingMode === "github" && hostingIdentity && githubSection ? (
    <GitHubProviderSection
      identity={hostingIdentity}
      section={githubSection}
      layout={gitSidebarLayout}
      mergeCount={sidebarModel.mergeResources.length}
      disabled={disabled}
      operationLoading={operationLoading}
      primaryAction={primaryActionSlot === "sync"}
      onPull={pull}
    />
  ) : null;

  const scrollableContentRevision = useMemo(
    () => ({ expanded, loading, status }),
    [expanded, loading, status],
  );
  const {
    activeResizeSplit,
    beginPanelResize,
    getPanelStyle,
    resizePanelsByKeyboard,
    setPanelRef,
    sidebarListRef,
  } = useGitSidebarPanelLayout(scrollableContentRevision);
  const panels: GitSidebarRenderPanel[] = [];

  if (remoteSection) {
    panels.push({
      id: "remote",
      className: "remote",
      grow: 1.05,
      expanded: expanded.remote,
      bodyRows: getGitSidebarPanelBodyRows(0),
      content: (
        <GitScmSyncRow
          status={status}
          state={syncState}
          disabled={disabled}
          operationLoading={operationLoading}
          primaryAction={primaryActionSlot === "sync"}
          onPull={pull}
          onPush={push}
          onPublish={publish}
          blockedByConflicts={sidebarModel.hasConflicts}
        />
      ),
    });
  }

  panels.push(...createGitLocalStatusPanels({
    model: sidebarModel,
    expanded,
    disabled,
    operationLoading,
    fileIconTheme,
    selectedWorkingFile,
    primaryActionSlot,
    syncPushLabel: syncState.pushLabel,
    actions,
    t,
    onToggle: toggle,
  }));

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
                cloudBackupLoading={cloudBackup.loading}
                cloudBackupError={cloudBackup.error}
                dismissed={backupCardDismissed}
                cloudEnabled={cloudBackup.enabled ?? true}
                onDismiss={() => setBackupCardDismissed(true)}
                onStartPuppyoneBackup={cloudBackup.start}
              />
              {operationError && (
                <div className="desktop-git-operation-error" role="alert">{operationError}</div>
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
                  {index > 0 && panels[index - 1].expanded && panel.expanded && (
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
              onSelect={() => selectPanel("history")}
            />
          </>
        )}
      </SidebarScrollArea>
    </SidebarRoot>
  );
}
