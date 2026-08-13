import { type ComponentProps, type MouseEvent as ReactMouseEvent } from "react";
import { Plus } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import {
  DataWorkspace,
  type AiEditRequest,
  type DataNode,
  type DocumentSessionStatus,
  type Workspace,
} from "@puppyone/shared-ui";
import { AiResponseChangesCard } from "../../ai-edits/AiResponseChangesCard";
import { openExternalUrl } from "../../lib/localFiles";
import {
  DesktopExplorerRowActions,
  rectToCreateEntryAnchor,
  type DesktopCreateEntryAnchorInput,
} from "../data-workspace/nodeActions";
import type { FileClipboardController } from "../data-workspace/useFileClipboard";
import type { GitStatusSnapshot } from "../../types/electron";
import { useDesktopPaneLayout } from "./layout/DesktopPaneLayoutContext";
import {
  COLLAPSED_EXPLORER_WIDTH,
  EXPLORER_COLLAPSE_THRESHOLD,
  MAX_EXPLORER_WIDTH,
  MIN_EXPLORER_WIDTH,
} from "./layout/desktopPaneLayout";
import type { DesktopPreferencesController } from "./useDesktopPreferences";
import {
  DesktopSidebarFooterNavigation,
  DesktopSidebarRailNavigation,
  DesktopSidebarTopNavigation,
} from "./navigation";
import { WorkspaceSurfaceOutlet, type ResolvedWorkspaceSurface } from "./workspace-surfaces";
import type { DesktopView } from "../../components/DesktopCloudShell";
import { setNativeSurfacePointerPassthrough } from "../native-surfaces";
import { DesktopEditorSplitView } from "../editor-workbench/DesktopEditorSplitView";
import type { DesktopEditorGroupController } from "../editor-workbench/useDesktopEditorGroup";

type DataWorkspaceProps = ComponentProps<typeof DataWorkspace>;

export type DesktopDataWorkspaceSurfaceProps = {
  activeAiEditRequest: AiEditRequest | null;
  activeDataPath: string | null;
  dataPort: NonNullable<DataWorkspaceProps["dataPort"]>;
  editorWorkbench: DesktopEditorGroupController;
  editorInteractionPreferences: NonNullable<DataWorkspaceProps["editorInteractionPreferences"]>;
  fileClipboardController: FileClipboardController;
  fileOperationNotice: string | null;
  minimalMode: boolean;
  navigation: {
    activeView: DesktopView;
    availableSurfaceIds: readonly DesktopView[];
    cloudHubEnabled: boolean;
    gitEnabled: boolean;
    pluginsEnabled: boolean;
    gitIncomingCount: number;
    gitOperationLoading: string | null;
    gitStatus: GitStatusSnapshot | null;
    workspaceChangeCount: number;
    onNavigate: (view: DesktopView) => void;
    onOpenSettings: () => void;
  };
  onActiveDataPathChange: (
    path: string | null,
    node?: DataNode | null,
  ) => void | Promise<void>;
  onActiveDataNodeChange: (node: DataNode | null) => void;
  onCloseEditor: (editorId: string) => void;
  onResourceMove: (previousPath: string, nextPath: string) => void | Promise<void>;
  onCreateEntryMenu: (parentPath: string | null, anchorRect: DesktopCreateEntryAnchorInput) => void;
  onDismissCreateEntryMenu: () => void;
  onNodeActionMenu: (node: DataNode, anchorRect: DOMRect, selectedNodes?: readonly DataNode[]) => void;
  preferences: DesktopPreferencesController;
  resolvedSurface: ResolvedWorkspaceSurface;
  viewerExtensionAdapter: DataWorkspaceProps["viewerExtensionAdapter"];
  workspace: Workspace;
  workspaceKey: string;
  workspaceRefreshToken: number;
  workspaceSurfaceError: string | null;
  workingCopyStatuses: ReadonlyMap<string, DocumentSessionStatus>;
  sidebarCreateMenuOpen: boolean;
};

export function DesktopDataWorkspaceSurface({
  activeAiEditRequest,
  activeDataPath,
  dataPort,
  editorWorkbench,
  editorInteractionPreferences,
  fileClipboardController,
  fileOperationNotice,
  minimalMode,
  navigation,
  onActiveDataNodeChange,
  onCloseEditor,
  onResourceMove,
  onActiveDataPathChange,
  onCreateEntryMenu,
  onDismissCreateEntryMenu,
  onNodeActionMenu,
  preferences,
  resolvedSurface,
  viewerExtensionAdapter,
  workspace,
  workspaceKey,
  workspaceRefreshToken,
  workspaceSurfaceError,
  workingCopyStatuses,
  sidebarCreateMenuOpen,
}: DesktopDataWorkspaceSurfaceProps) {
  const { t } = useLocalization();
  const paneLayout = useDesktopPaneLayout();
  const resolvedExplorerWidth = paneLayout?.explorer.width ?? preferences.explorerWidth;
  const resolvedExplorerMaxWidth = paneLayout?.explorer.maxWidth
    ?? MAX_EXPLORER_WIDTH;
  const resolvedExplorerMinWidth = paneLayout?.explorer.minWidth ?? MIN_EXPLORER_WIDTH;
  const resolvedExplorerCollapsed = paneLayout?.explorer.collapsed
    ?? preferences.sidebarCollapsed;
  const navigationCommon = {
    activeView: navigation.activeView,
    availableSurfaceIds: navigation.availableSurfaceIds,
    cloudHubEnabled: navigation.cloudHubEnabled,
    gitEnabled: navigation.gitEnabled,
    pluginsEnabled: navigation.pluginsEnabled,
    gitIncomingCount: navigation.gitIncomingCount,
    gitOperationLoading: navigation.gitOperationLoading,
    gitStatus: navigation.gitStatus,
    workspaceChangeCount: navigation.workspaceChangeCount,
    onNavigate: navigation.onNavigate,
    onOpenSettings: navigation.onOpenSettings,
  } as const;

  return (
    <div
      className="desktop-data-workspace-wrap"
      data-minimal-mode={minimalMode ? "true" : undefined}
      data-sidebar-navigation-placement={minimalMode ? undefined : preferences.sidebarNavigationPlacement}
    >
      {workspaceSurfaceError && (
        <div className="desktop-workspace-surface-alert" role="status">{workspaceSurfaceError}</div>
      )}
      {fileClipboardController.notice && fileOperationNotice && (
        <div
          className="desktop-file-operation-notice"
          data-tone={fileClipboardController.notice.tone}
          role="status"
          aria-live="polite"
          dir="auto"
        >
          {fileOperationNotice}
        </div>
      )}
      <DataWorkspace
        key={workspaceKey}
        workspace={workspace}
        labels={{ root: workspace.name }}
        dataPort={dataPort}
        activePath={activeDataPath}
        onResourceMove={onResourceMove}
        onActivePathChange={onActiveDataPathChange}
        onActiveNodeChange={onActiveDataNodeChange}
        onOpenExternalUrl={openExternalUrl}
        viewerExtensionAdapter={viewerExtensionAdapter}
        documentSourceKind="local"
        resizableExplorer
        explorerCollapsed={resolvedExplorerCollapsed}
        explorerWidth={resolvedExplorerWidth}
        minExplorerWidth={resolvedExplorerMinWidth}
        maxExplorerWidth={resolvedExplorerMaxWidth}
        collapsedExplorerWidth={COLLAPSED_EXPLORER_WIDTH}
        explorerCollapseThreshold={EXPLORER_COLLAPSE_THRESHOLD}
        onExplorerCollapsedChange={preferences.setSidebarCollapsed}
        onExplorerWidthChange={preferences.setExplorerWidth}
        onExplorerResizeActiveChange={setNativeSurfacePointerPassthrough}
        showHeader={false}
        showExplorerRoot={false}
        onExplorerRootContextMenu={(_state, event) => {
          event.preventDefault();
          event.stopPropagation();
          onCreateEntryMenu(null, getContextMenuAnchorRect(event));
        }}
        onExplorerNodeContextMenu={(state, node, event) => {
          event.preventDefault();
          event.stopPropagation();
          const selectedNodes = state.selectedNodes.some(({ path }) => path === node.path)
            ? state.selectedNodes
            : [node];
          onNodeActionMenu(node, getContextMenuAnchorRect(event), selectedNodes);
        }}
        explorerCutPaths={fileClipboardController.cutPaths}
        onCopyNodes={fileClipboardController.copyNodes}
        onCutNodes={fileClipboardController.cutNodes}
        onPasteNodes={fileClipboardController.pasteNodes}
        onDuplicateNodes={fileClipboardController.duplicateNodes}
        explorerListEndSlot={(
          <div
            className="desktop-explorer-list-end-create"
            data-open={sidebarCreateMenuOpen ? "true" : undefined}
          >
            <button
              className="tree-row desktop-explorer-list-end-create-row"
              type="button"
              aria-expanded={sidebarCreateMenuOpen}
              aria-controls="desktop-sidebar-create-menu"
              onClick={(event) => {
                if (sidebarCreateMenuOpen) {
                  onDismissCreateEntryMenu();
                  return;
                }
                onCreateEntryMenu(
                  null,
                  rectToCreateEntryAnchor(event.currentTarget.getBoundingClientRect(), "auto-end"),
                );
              }}
            >
              <span className="tree-row-content desktop-explorer-list-end-create-command">
                <span className="tree-icon-slot"><Plus size={14} strokeWidth={2.2} aria-hidden="true" /></span>
                <span className="tree-label"><span className="tree-label-primary">{t("workspace.explorer.new")}</span></span>
              </span>
            </button>
          </div>
        )}
        showExplorerToolbar={!minimalMode && preferences.sidebarNavigationPlacement === "top"}
        explorerToolbarSlot={!minimalMode && preferences.sidebarNavigationPlacement === "top" ? (
          <DesktopSidebarTopNavigation
            {...navigationCommon}
            orientation={preferences.sidebarNavigationOrientation}
          />
        ) : undefined}
        explorerRailSlot={!minimalMode && preferences.sidebarNavigationPlacement === "left" ? (
          <DesktopSidebarRailNavigation {...navigationCommon} />
        ) : undefined}
        showPreviewHeader={false}
        loadActiveFileSource={resolvedSurface.id !== "data"}
        hidePreviewSourceView
        fileIconTheme={preferences.fileIconTheme}
        editorInteractionPreferences={editorInteractionPreferences}
        editorSaveMode="auto"
        htmlTrustMode="safe"
        aiEditRequest={activeAiEditRequest}
        enableMarkdownLinkContentIndexing
        folderExpansionStrategy="load-before-expand"
        refreshKey={workspaceRefreshToken}
        explorerNodeActionSlot={(state, node) => (
          <DesktopExplorerRowActions
            node={node}
            parentPath={node.type === "folder" ? node.path : null}
            onCreate={onCreateEntryMenu}
            onOpenNodeMenu={(targetNode, anchorRect) => {
              const selectedNodes = state.selectedNodes.some(({ path }) => path === targetNode.path)
                ? state.selectedNodes
                : [targetNode];
              onNodeActionMenu(targetNode, anchorRect, selectedNodes);
            }}
          />
        )}
        explorerSlot={resolvedSurface.id === "data"
          ? undefined
          : <WorkspaceSurfaceOutlet region="sidebar" surface={resolvedSurface} />}
        explorerFooterSlot={!minimalMode && preferences.sidebarNavigationPlacement === "bottom"
          ? <DesktopSidebarFooterNavigation {...navigationCommon} />
          : undefined}
        mainSlot={resolvedSurface.id === "data"
          ? (state) => (
              <DesktopEditorSplitView
                aiEditRequest={activeAiEditRequest}
                dataPort={dataPort}
                editorGroup={editorWorkbench.state}
                editorInteractionPreferences={editorInteractionPreferences}
                fileIconTheme={preferences.fileIconTheme}
                layout={editorWorkbench.paneLayout}
                refreshKey={workspaceRefreshToken}
                state={state}
                viewerExtensionAdapter={viewerExtensionAdapter}
                workingCopyStatuses={workingCopyStatuses}
                workspace={workspace}
                onCloseEditor={onCloseEditor}
                onClosePane={editorWorkbench.closePane}
                onFocusPane={editorWorkbench.focusPane}
                onResizeSplit={editorWorkbench.resizeSplit}
                onSplitPane={editorWorkbench.splitPane}
              />
            )
          : resolvedSurface.content.main == null
            ? undefined
            : <WorkspaceSurfaceOutlet region="main" surface={resolvedSurface} />}
        capabilities={{
          create: true,
          rename: true,
          delete: true,
          move: true,
          copy: Boolean(dataPort.copyNode),
          write: Boolean(dataPort.documentPersistence),
          history: true,
          accessPoints: false,
          cloudSync: false,
          localGit: navigation.gitEnabled,
          connectors: false,
        }}
      />
      {activeAiEditRequest && resolvedSurface.id === "data" && (
        <div className="desktop-ai-edit-review-floating">
          <AiResponseChangesCard
            request={activeAiEditRequest}
            activePath={activeDataPath}
            onOpenFile={onActiveDataPathChange}
          />
        </div>
      )}
    </div>
  );
}

function getContextMenuAnchorRect(event: ReactMouseEvent<HTMLElement>): DOMRect {
  if (event.clientX === 0 && event.clientY === 0) {
    return event.currentTarget.getBoundingClientRect();
  }
  return new DOMRect(event.clientX, event.clientY, 0, 0);
}
