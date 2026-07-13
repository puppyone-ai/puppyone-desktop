import { type ComponentProps, type MouseEvent as ReactMouseEvent } from "react";
import { Plus } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import {
  DataWorkspace,
  type AiEditRequest,
  type DataNode,
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
import {
  COLLAPSED_EXPLORER_WIDTH,
  MAX_EXPLORER_WIDTH,
  MIN_EXPLORER_WIDTH,
} from "./preferences";
import type { DesktopPreferencesController } from "./useDesktopPreferences";
import {
  DesktopSidebarFooterNavigation,
  DesktopSidebarRailNavigation,
  DesktopSidebarTopNavigation,
  type DesktopWorkspaceSurfaceAction,
} from "./navigation";
import { WorkspaceSurfaceOutlet, type ResolvedWorkspaceSurface } from "./workspace-surfaces";
import type { DesktopView } from "../../components/DesktopCloudShell";

type DataWorkspaceProps = ComponentProps<typeof DataWorkspace>;

export type DesktopDataWorkspaceSurfaceProps = {
  activeAiEditRequest: AiEditRequest | null;
  activeDataPath: string | null;
  cloudWorkspace: boolean;
  dataPort: NonNullable<DataWorkspaceProps["dataPort"]>;
  editorInteractionPreferences: NonNullable<DataWorkspaceProps["editorInteractionPreferences"]>;
  fileClipboardController: FileClipboardController;
  fileOperationNotice: string | null;
  minimalMode: boolean;
  navigation: {
    activeView: DesktopView;
    availableSurfaceIds: readonly DesktopView[];
    cloudHistoryEnabled: boolean;
    cloudHubEnabled: boolean;
    cloudToolsEnabled: boolean;
    gitEnabled: boolean;
    pluginsEnabled: boolean;
    gitIncomingCount: number;
    gitOperationLoading: string | null;
    gitStatus: GitStatusSnapshot | null;
    workspaceChangeCount: number;
    surfaceAction: DesktopWorkspaceSurfaceAction | null;
    onNavigate: (view: DesktopView) => void;
    onOpenSettings: () => void;
  };
  onActiveDataPathChange: (path: string | null, node?: DataNode | null) => void;
  onActiveDataNodeChange: (node: DataNode | null) => void;
  onCreateEntryMenu: (parentPath: string | null, anchorRect: DesktopCreateEntryAnchorInput) => void;
  onNodeActionMenu: (node: DataNode, anchorRect: DOMRect, selectedNodes?: readonly DataNode[]) => void;
  preferences: DesktopPreferencesController;
  renderPreviewBody: NonNullable<DataWorkspaceProps["renderPreviewBody"]>;
  resolvedSurface: ResolvedWorkspaceSurface;
  viewerExtensionAdapter: DataWorkspaceProps["viewerExtensionAdapter"];
  workspace: Workspace;
  workspaceKey: string;
  workspaceRefreshToken: number;
  workspaceSurfaceError: string | null;
};

export function DesktopDataWorkspaceSurface({
  activeAiEditRequest,
  activeDataPath,
  cloudWorkspace,
  dataPort,
  editorInteractionPreferences,
  fileClipboardController,
  fileOperationNotice,
  minimalMode,
  navigation,
  onActiveDataNodeChange,
  onActiveDataPathChange,
  onCreateEntryMenu,
  onNodeActionMenu,
  preferences,
  renderPreviewBody,
  resolvedSurface,
  viewerExtensionAdapter,
  workspace,
  workspaceKey,
  workspaceRefreshToken,
  workspaceSurfaceError,
}: DesktopDataWorkspaceSurfaceProps) {
  const { t } = useLocalization();
  const navigationCommon = {
    activeView: navigation.activeView,
    availableSurfaceIds: navigation.availableSurfaceIds,
    cloudHistoryEnabled: navigation.cloudHistoryEnabled,
    cloudHubEnabled: navigation.cloudHubEnabled,
    cloudToolsEnabled: navigation.cloudToolsEnabled,
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
        onActivePathChange={onActiveDataPathChange}
        onActiveNodeChange={onActiveDataNodeChange}
        onOpenExternalUrl={openExternalUrl}
        viewerExtensionAdapter={viewerExtensionAdapter}
        documentSourceKind={cloudWorkspace ? "cloud" : "local"}
        resizableExplorer
        explorerCollapsed={false}
        explorerWidth={preferences.explorerWidth}
        minExplorerWidth={MIN_EXPLORER_WIDTH}
        maxExplorerWidth={MAX_EXPLORER_WIDTH}
        collapsedExplorerWidth={COLLAPSED_EXPLORER_WIDTH}
        onExplorerWidthChange={preferences.setExplorerWidth}
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
          <button
            className="tree-row desktop-explorer-list-end-create-row"
            type="button"
            onClick={(event) => onCreateEntryMenu(
              null,
              rectToCreateEntryAnchor(event.currentTarget.getBoundingClientRect(), "auto-end"),
            )}
          >
            <span className="tree-row-content desktop-explorer-list-end-create-command">
              <span className="tree-icon-slot"><Plus size={14} strokeWidth={2.2} aria-hidden="true" /></span>
              <span className="tree-label"><span className="tree-label-primary">{t("workspace.explorer.new")}</span></span>
            </span>
          </button>
        )}
        showExplorerToolbar={!minimalMode && preferences.sidebarNavigationPlacement === "top"}
        explorerToolbarSlot={!minimalMode && preferences.sidebarNavigationPlacement === "top" ? (
          <DesktopSidebarTopNavigation
            {...navigationCommon}
            orientation={preferences.sidebarNavigationOrientation}
          />
        ) : undefined}
        explorerRailSlot={!minimalMode && preferences.sidebarNavigationPlacement === "left" ? (
          <DesktopSidebarRailNavigation {...navigationCommon} surfaceAction={navigation.surfaceAction} />
        ) : undefined}
        showPreviewHeader={false}
        hidePreviewSourceView
        renderPreviewBody={renderPreviewBody}
        fileIconTheme={preferences.fileIconTheme}
        editorInteractionPreferences={editorInteractionPreferences}
        editorSaveMode="auto"
        htmlTrustMode="safe"
        aiEditRequest={activeAiEditRequest}
        enableMarkdownLinkContentIndexing={!cloudWorkspace}
        folderExpansionStrategy={cloudWorkspace ? "optimistic" : "load-before-expand"}
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
        explorerFooterSlot={!minimalMode && preferences.sidebarNavigationPlacement === "bottom" ? (
          <DesktopSidebarFooterNavigation {...navigationCommon} surfaceAction={navigation.surfaceAction} />
        ) : undefined}
        mainSlot={resolvedSurface.id === "data" || resolvedSurface.content.main == null
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
