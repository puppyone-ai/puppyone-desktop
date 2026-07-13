import { ArrowDown, ArrowUp, ArrowUpRight, Clock3, Cloud, Github, Plus, Undo2, X } from "lucide-react";
import { useScrollableDescendantClasses, type FileIconThemeId } from "@puppyone/shared-ui";
import {
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../types/electron";
import type { GitDisplayMode } from "../../preferences";
import { openExternalUrl } from "../../lib/localFiles";
import { useLocalization, type MessageFormatter } from "@puppyone/localization";
import {
  SourceControlPreviewResourceList,
  SourceControlSectionHeader,
  SourceControlWorkingTreeRow,
} from "./components";
import type { GitActionIconKind, GitHostingIdentity, GitMainPanel, GitSyncState, GitWorkingSelection } from "./types";
import {
  buildSourceControlSidebarModel,
  getGitHostingIdentity,
  getGitHostingMode,
  getGitScmSyncSection,
  getSourceControlPrimaryActionSlot,
  getGitSyncState,
} from "./viewModel";

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

type GitSidebarPanelId = "remote" | "merge" | "committed" | "staged" | "unstaged";

type GitSidebarPanel = {
  id: GitSidebarPanelId;
  className: string;
  grow: number;
  expanded: boolean;
  bodyRows: number;
  content: ReactNode;
};

const GIT_SIDEBAR_PANEL_MAX_VISIBLE_ROWS = 9;
const GIT_SIDEBAR_PANEL_EMPTY_BODY_ROWS = 1.5;
const GIT_SIDEBAR_ROW_VERTICAL_MARGIN_PX = 2;
const GIT_SCROLLABLE_LIST_SELECTOR = [
  ".desktop-working-tree-list",
  ".desktop-git-remote-preview",
  ".desktop-history-list",
  ".desktop-git-changes-scroll",
  ".desktop-git-history-scroll",
].join(",");
const GIT_SIDEBAR_PANEL_MIN_HEIGHT: Record<GitSidebarPanelId, number> = {
  remote: 72,
  merge: 72,
  committed: 72,
  staged: 72,
  unstaged: 72,
};

function getPanelBodyRows(resourceCount: number, hasBodyPlaceholder = false) {
  if (resourceCount > 0) return resourceCount;
  return hasBodyPlaceholder ? GIT_SIDEBAR_PANEL_EMPTY_BODY_ROWS : 0;
}

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
  const [panelHeights, setPanelHeights] = useState<Partial<Record<GitSidebarPanelId, number>>>({});
  const [activeResizeSplit, setActiveResizeSplit] = useState<string | null>(null);
  const sidebarListRef = useRef<HTMLDivElement | null>(null);
  const panelRefs = useRef<Partial<Record<GitSidebarPanelId, HTMLDivElement | null>>>({});
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

  const setPanelRef = useCallback((id: GitSidebarPanelId, node: HTMLDivElement | null) => {
    panelRefs.current[id] = node;
  }, []);

  const beginPanelResize = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    previous: GitSidebarPanelId,
    next: GitSidebarPanelId,
  ) => {
    if (event.button !== 0) return;
    const previousNode = panelRefs.current[previous];
    const nextNode = panelRefs.current[next];
    if (!previousNode || !nextNode) return;

    const previousStart = previousNode.getBoundingClientRect().height;
    const nextStart = nextNode.getBoundingClientRect().height;
    const totalHeight = previousStart + nextStart;
    const previousMin = getPanelComputedMinHeight(previousNode, GIT_SIDEBAR_PANEL_MIN_HEIGHT[previous]);
    const nextMin = getPanelComputedMinHeight(nextNode, GIT_SIDEBAR_PANEL_MIN_HEIGHT[next]);
    if (totalHeight < previousMin + nextMin) return;

    const startY = event.clientY;
    const splitId = `${previous}:${next}`;
    event.preventDefault();
    setActiveResizeSplit(splitId);
    document.body.classList.add("desktop-git-sidebar-resizing");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY;
      const previousMax = getPanelComputedMaxHeight(previousNode, previousStart);
      const nextMax = getPanelComputedMaxHeight(nextNode, nextStart);
      const previousLowerBound = Math.max(previousMin, totalHeight - nextMax);
      const previousUpperBound = Math.min(previousMax, totalHeight - nextMin);
      if (previousLowerBound > previousUpperBound) return;

      const nextPreviousHeight = clampNumber(previousStart + delta, previousLowerBound, previousUpperBound);
      const nextNextHeight = totalHeight - nextPreviousHeight;
      setPanelHeights((current) => ({
        ...current,
        [previous]: Math.round(nextPreviousHeight),
        [next]: Math.round(nextNextHeight),
      }));
    };

    const stopResize = () => {
      setActiveResizeSplit(null);
      document.body.classList.remove("desktop-git-sidebar-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, []);

  const getPanelStyle = useCallback((panel: GitSidebarPanel): CSSProperties => {
    if (!panel.expanded) {
      return {
        flex: "0 0 var(--desktop-sidebar-row-height)",
        maxHeight: "var(--desktop-sidebar-row-height)",
        minHeight: "var(--desktop-sidebar-row-height)",
      };
    }
    const visibleBodyRows = clampNumber(panel.bodyRows, 0, GIT_SIDEBAR_PANEL_MAX_VISIBLE_ROWS);
    const maxHeight = visibleBodyRows > 0
      ? `calc(var(--desktop-sidebar-row-height) * ${visibleBodyRows + 1} + var(--git-section-body-top-gap) + ${visibleBodyRows * GIT_SIDEBAR_ROW_VERTICAL_MARGIN_PX}px)`
      : "var(--desktop-sidebar-row-height)";
    const minHeight = `min(${GIT_SIDEBAR_PANEL_MIN_HEIGHT[panel.id]}px, ${maxHeight})`;
    const height = panelHeights[panel.id];
    if (typeof height === "number") {
      return {
        flex: `0 1 ${height}px`,
        maxHeight,
        minHeight,
      };
    }
    return {
      flexGrow: panel.grow,
      maxHeight,
      minHeight,
    };
  }, [panelHeights]);

  const scrollableContentRevision = useMemo(() => ({
    committedExpanded,
    loading,
    mergeExpanded,
    panelHeights,
    remoteExpanded,
    stagedExpanded,
    status,
    workingExpanded,
  }), [
    committedExpanded,
    loading,
    mergeExpanded,
    panelHeights,
    remoteExpanded,
    stagedExpanded,
    status,
    workingExpanded,
  ]);

  useScrollableDescendantClasses(sidebarListRef, {
    revision: scrollableContentRevision,
    selector: GIT_SCROLLABLE_LIST_SELECTOR,
  });

  const panels: GitSidebarPanel[] = [];

  if (remoteSection) {
    panels.push({
      id: "remote",
      className: "remote",
      grow: 1.05,
      expanded: remoteExpanded,
      bodyRows: getPanelBodyRows(remoteSection?.previewResources.length ?? 0, Boolean(remoteSection?.fallbackSummary)),
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
      bodyRows: getPanelBodyRows(mergeResources.length),
      content: (
        <>
          <SourceControlSectionHeader
            title={t("source-control.section.merge")}
            count={mergeResources.length}
            expanded={mergeExpanded}
            onToggle={() => setMergeExpanded((expanded) => !expanded)}
          />
          <GitSectionCollapse expanded={mergeExpanded}>
            <div className="desktop-working-tree-list">
              {mergeResources.map((resource) => (
                <SourceControlWorkingTreeRow
                  resource={resource}
                  key={resource.id}
                  selected={selectedWorkingFile?.path === resource.path && selectedWorkingFile.staged === resource.staged}
                  operationLoading={operationLoading}
                  fileIconTheme={fileIconTheme}
                  onSelect={onSelectWorkingFile}
                  onStagePaths={onStagePaths}
                  onUnstagePaths={onUnstagePaths}
                  onDiscardPaths={onDiscardPaths}
                />
              ))}
            </div>
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
      bodyRows: getPanelBodyRows(committedResources.length, true),
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
              <div className="desktop-tool-sidebar-empty compact desktop-git-empty-committed">{t("source-control.status.empty")}</div>
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
      bodyRows: getPanelBodyRows(stagedResources.length, true),
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
              <div className="desktop-tool-sidebar-empty compact desktop-git-empty-stage">{t("source-control.status.empty")}</div>
            ) : (
              <div className="desktop-working-tree-list">
                {stagedResources.map((resource) => (
                  <SourceControlWorkingTreeRow
                    resource={resource}
                    key={resource.id}
                    selected={selectedWorkingFile?.staged === true && selectedWorkingFile.path === resource.path}
                    operationLoading={operationLoading}
                    fileIconTheme={fileIconTheme}
                    onSelect={onSelectWorkingFile}
                    onStagePaths={onStagePaths}
                    onUnstagePaths={onUnstagePaths}
                    onDiscardPaths={onDiscardPaths}
                  />
                ))}
              </div>
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
    bodyRows: getPanelBodyRows(localChangeResources.length, true),
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
                <button
                  className="desktop-tool-sidebar-icon danger"
                  type="button"
                  title={t("source-control.action.discardAll")}
                  aria-label={t("source-control.action.discardAll")}
                  disabled={disabled}
                  onClick={() => void onDiscardAll()}
                >
                  <Undo2 size={13} />
                </button>
                <button
                  className="desktop-tool-sidebar-icon desktop-git-stage-all-action"
                  type="button"
                  title={t("source-control.action.stageAll")}
                  aria-label={t("source-control.action.stageAll")}
                  disabled={disabled}
                  onClick={() => void onStageAll()}
                >
                  <Plus size={13} />
                </button>
              </div>
            ) : null
          ) : showSimpleChangeAction ? (
            <div className="desktop-git-section-actions">
              {workingResources.length > 0 && (
                <button
                  className="desktop-tool-sidebar-icon danger"
                  type="button"
                  title={t("source-control.action.discardAll")}
                  aria-label={t("source-control.action.discardAll")}
                  disabled={disabled}
                  onClick={() => void onDiscardAll()}
                >
                  <Undo2 size={13} />
                </button>
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
            <div className="desktop-tool-sidebar-empty compact desktop-git-empty-changes">{t("source-control.status.empty")}</div>
          ) : (
            <div className="desktop-working-tree-list">
              {localChangeResources.map((resource) => (
                <SourceControlWorkingTreeRow
                  resource={resource}
                  key={resource.id}
                  selected={selectedWorkingFile?.staged === (resource.group === "index") && selectedWorkingFile.path === resource.path}
                  operationLoading={operationLoading}
                  fileIconTheme={fileIconTheme}
                  onSelect={onSelectWorkingFile}
                  onStagePaths={onStagePaths}
                  onUnstagePaths={onUnstagePaths}
                  onDiscardPaths={onDiscardPaths}
                />
              ))}
            </div>
          )}
        </GitSectionCollapse>
      </>
    ),
  });

  return (
    <section className="desktop-tool-sidebar desktop-git-sidebar">
      <div ref={sidebarListRef} className="desktop-tool-sidebar-list desktop-git-sidebar-list">
        {error ? (
          <div className="desktop-tool-sidebar-empty danger">{error}</div>
        ) : status && !status.isRepo ? (
          <div className={`desktop-tool-sidebar-empty${operationError ? " vertical" : ""}`}>
            <span>{t("source-control.status.noRepository")}</span>
            {operationError && <small className="desktop-tool-sidebar-error-text">{operationError}</small>}
          </div>
        ) : loading && !status ? (
          <div className="desktop-tool-sidebar-empty">{t("source-control.status.readingGit")}</div>
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
      </div>
    </section>
  );
}

function GitSectionCollapse({
  expanded,
  children,
}: {
  expanded: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`desktop-git-section-collapse ${expanded ? "expanded" : "collapsed"}`}>
      <div className="desktop-git-section-collapse-inner">
        {children}
      </div>
    </div>
  );
}

function PuppyoneCloudProviderSection({
  status,
  mergeCount,
  fileIconTheme,
  selectedWorkingFile,
  disabled,
  operationLoading,
  primaryAction,
  onSelectWorkingFile,
  onPull,
}: {
  status: GitStatusSnapshot | null;
  mergeCount: number;
  fileIconTheme: FileIconThemeId;
  selectedWorkingFile: GitWorkingSelection | null;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
  onPull: () => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const remote = status?.sourceControl.remote ?? null;
  const cloudUpdateCount = remote?.behind ?? 0;
  const cloudPreviewResources = cloudUpdateCount > 0 ? remote?.incomingPreview ?? [] : [];
  const downloadBlockedByConflicts = mergeCount > 0;
  const canDownload = Boolean(remote?.canPull) && !downloadBlockedByConflicts;
  const downloadTitle = downloadBlockedByConflicts
    ? t("source-control.cloud.resolveBeforeDownload")
    : canDownload
      ? t("source-control.cloud.downloadTitle")
      : t("source-control.cloud.upToDate");

  return (
    <section className="desktop-git-cloud-provider-section">
      <SourceControlSectionHeader
        title="PuppyOne Cloud"
        count={cloudUpdateCount}
        highlightCount={cloudUpdateCount > 0}
        leadingIcon={<Cloud size={14} strokeWidth={2} />}
        action={(
          <GitOperationButton
            className="desktop-git-commit-push-action"
            title={downloadTitle}
            disabled={disabled || !canDownload}
            icon="download"
            label={t("source-control.action.download")}
            loadingKey="pull"
            loadingLabel={t("source-control.action.downloading")}
            operationLoading={operationLoading}
            primary={primaryAction}
            onClick={() => void onPull()}
          />
        )}
      />
      <div className="desktop-git-cloud-provider-body">
        {cloudPreviewResources.length > 0 ? (
          <SourceControlPreviewResourceList
            resources={cloudPreviewResources}
            fileIconTheme={fileIconTheme}
            selectedWorkingFile={selectedWorkingFile}
            origin="remote"
            ariaLabel={t("source-control.preview.cloud")}
            onSelectWorkingFile={onSelectWorkingFile}
          />
        ) : (
          <div className="desktop-tool-sidebar-empty compact desktop-git-empty-remote">
            {cloudUpdateCount > 0
              ? t("source-control.cloud.updateCount", { count: cloudUpdateCount })
              : t("source-control.status.empty")}
          </div>
        )}
      </div>
    </section>
  );
}

function getCommittedSummary(count: number, actionLabel: string, t: MessageFormatter) {
  return t("source-control.committed.ready", { count, action: actionLabel });
}

function GitHostingIdentityRow({ identity }: { identity: GitHostingIdentity }) {
  const { t } = useLocalization();
  const label = identity.label;
  const href = identity.href;
  return (
    <div className="desktop-git-section-row desktop-git-hosting-identity-row" aria-label={t("source-control.hosting.repository")}>
      {href ? (
        <a
          className="desktop-git-section-title desktop-git-hosting-identity-link"
          href={href}
          title={href}
          onClick={(event) => {
            event.preventDefault();
            void openExternalUrl(href).catch((error) => {
              console.warn("Unable to open GitHub repository:", error);
            });
          }}
        >
          <span className="desktop-git-section-leading-icon">
            <Github size={14} strokeWidth={2} aria-hidden="true" />
          </span>
          <bdi>{label}</bdi>
          <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      ) : (
        <div className="desktop-git-section-title desktop-git-hosting-identity-text">
          <span className="desktop-git-section-leading-icon">
            <Github size={14} strokeWidth={2} aria-hidden="true" />
          </span>
          <bdi>{label}</bdi>
        </div>
      )}
    </div>
  );
}

function GitSidebarSectionResizer({
  previous,
  next,
  active,
  onPointerDown,
}: {
  previous: GitSidebarPanelId;
  next: GitSidebarPanelId;
  active: boolean;
  onPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    previous: GitSidebarPanelId,
    next: GitSidebarPanelId,
  ) => void;
}) {
  const { t } = useLocalization();
  return (
    <div
      className={`desktop-git-section-resizer ${active ? "active" : ""}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label={t("source-control.sidebar.resize")}
      onPointerDown={(event) => onPointerDown(event, previous, next)}
    />
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPanelComputedMaxHeight(node: HTMLElement, fallback: number) {
  const computedMaxHeight = window.getComputedStyle(node).maxHeight;
  if (!computedMaxHeight || computedMaxHeight === "none") return Number.POSITIVE_INFINITY;
  const parsed = Number.parseFloat(computedMaxHeight);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPanelComputedMinHeight(node: HTMLElement, fallback: number) {
  const computedMinHeight = window.getComputedStyle(node).minHeight;
  if (!computedMinHeight || computedMinHeight === "auto") return fallback;
  const parsed = Number.parseFloat(computedMinHeight);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function GitRemotePrompt({
  state,
  disabled,
  cloudBackupLoading,
  cloudBackupError,
  dismissed,
  cloudEnabled,
  onDismiss,
  onStartPuppyoneBackup,
}: {
  state: GitSyncState;
  disabled: boolean;
  cloudBackupLoading: boolean;
  cloudBackupError: string | null;
  dismissed: boolean;
  cloudEnabled: boolean;
  onDismiss: () => void;
  onStartPuppyoneBackup: () => void;
}) {
  const { t } = useLocalization();
  if (!cloudEnabled) return null;

  if (state.setupRequired) {
    if (dismissed && !cloudBackupError) return null;

    return (
      <section className="desktop-git-backup-card">
        <div className="desktop-git-backup-copy">
          <span>{t("source-control.backup.reminder")}</span>
        </div>
        <button
          className="desktop-git-backup-action"
          type="button"
          aria-busy={cloudBackupLoading || undefined}
          disabled={disabled || cloudBackupLoading}
          onClick={onStartPuppyoneBackup}
        >
          {cloudBackupLoading ? <SourceControlDots /> : <Cloud size={13} />}
          <span>{t("source-control.backup.getCloud")}</span>
        </button>
        <button
          className="desktop-git-backup-dismiss"
          type="button"
          aria-label={t("source-control.backup.dismissAriaLabel")}
          title={t("source-control.action.dismiss")}
          disabled={cloudBackupLoading}
          onClick={onDismiss}
        >
          <X size={13} />
        </button>
        {cloudBackupError && <div className="desktop-git-backup-error">{cloudBackupError}</div>}
      </section>
    );
  }

  return null;
}

function GitScmSyncRow({
  status,
  state,
  fileIconTheme,
  expanded,
  selectedWorkingFile,
  disabled,
  operationLoading,
  primaryAction,
  onToggleExpanded,
  onSelectWorkingFile,
  onPull,
  onPush,
  onPublish,
}: {
  status: GitStatusSnapshot | null;
  state: GitSyncState;
  fileIconTheme: FileIconThemeId;
  expanded: boolean;
  selectedWorkingFile: GitWorkingSelection | null;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onToggleExpanded: () => void;
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
  onPull: () => Promise<boolean>;
  onPush: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const section = getGitScmSyncSection(status, state, t);

  return (
    <section className={`desktop-git-remote-status desktop-git-scm-sync ${section.copy.tone}`}>
      <SourceControlSectionHeader
        title={section.copy.title}
        count={section.copy.count}
        highlightCount={section.copy.count > 0}
        expanded={expanded}
        onToggle={onToggleExpanded}
        action={section.action ? (
          <GitOperationButton
            className="desktop-git-remote-action"
            disabled={disabled || section.action.disabled}
            title={section.action.title}
            icon={section.action.icon}
            label={section.action.label}
            loadingKey={section.action.kind}
            loadingLabel={section.action.loadingLabel}
            operationLoading={operationLoading}
            primary={primaryAction}
            onClick={() => {
              if (section.action?.kind === "pull") void onPull();
              if (section.action?.kind === "push") void onPush();
              if (section.action?.kind === "publish") void onPublish();
            }}
          />
        ) : null}
      />
      {section.previewResources.length > 0 && (
        <GitSectionCollapse expanded={expanded}>
          <SourceControlPreviewResourceList
            resources={section.previewResources}
            fileIconTheme={fileIconTheme}
            selectedWorkingFile={selectedWorkingFile}
            origin="remote"
            ariaLabel={t("source-control.preview.remote")}
            onSelectWorkingFile={onSelectWorkingFile}
          />
        </GitSectionCollapse>
      )}
      {section.previewResources.length === 0 && section.fallbackSummary && (
        <GitSectionCollapse expanded={expanded}>
          <div className="desktop-git-preview-summary">{section.fallbackSummary}</div>
        </GitSectionCollapse>
      )}
    </section>
  );
}

function GitOperationButton({
  className,
  title,
  disabled,
  icon,
  label,
  loadingKey,
  loadingLabel,
  operationLoading,
  primary = false,
  onClick,
}: {
  className: string;
  title: string;
  disabled: boolean;
  icon: GitActionIconKind;
  label: string;
  loadingKey: string;
  loadingLabel: string;
  operationLoading: string | null;
  primary?: boolean;
  onClick: () => void;
}) {
  const loading = operationLoading === loadingKey;
  const buttonClassName = [
    "desktop-git-operation-button",
    className,
    primary ? "is-primary" : "",
    loading ? "is-loading" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      className={buttonClassName}
      type="button"
      title={title}
      aria-label={loading ? loadingLabel : label}
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {loading ? <SourceControlDots /> : renderGitActionIcon(icon)}
      <span className="desktop-git-operation-label">{loading ? loadingLabel : label}</span>
    </button>
  );
}

function SourceControlDots() {
  const { t } = useLocalization();
  return (
    <span className="desktop-git-loading-dots" data-puppy-loader="dots" role="status" aria-label={t("common.status.loading")}>
      {[0, 1, 2].map((index) => (
        <span key={index} style={{ animationDelay: `${index * 0.16}s` }} />
      ))}
    </span>
  );
}

function renderGitActionIcon(icon: GitActionIconKind) {
  if (icon === "plus") return <Plus size={15} strokeWidth={2.25} aria-hidden="true" />;
  const Icon = icon === "upload" ? ArrowUp : ArrowDown;
  return <Icon className="desktop-git-action-arrow" size={15} strokeWidth={2.25} aria-hidden="true" />;
}

function GitHistoryShortcut({
  active,
  count,
  onSelect,
}: {
  active: boolean;
  count: number;
  onSelect: () => void;
}) {
  const { t, formatNumber } = useLocalization();
  return (
    <section className="desktop-git-history-drawer">
      <button
        className={`desktop-git-history-drawer-header ${active ? "active" : ""}`}
        type="button"
        aria-pressed={active}
        onClick={onSelect}
      >
        <Clock3 size={13} />
        <span>{t("source-control.history.title")}</span>
        <small>{formatNumber(count)}</small>
      </button>
    </section>
  );
}
