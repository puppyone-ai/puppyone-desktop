import {
  useCallback,
  useMemo,
  type ComponentProps,
} from "react";
import {
  DataWorkspace,
  DocumentSessionBoundary,
  type AiEditRequest,
  type DataNode,
  type DataWorkspaceActivePathChangeContext,
  type EditorInteractionPreferences,
  type EditorDocumentSession,
  type FilePreviewBodyContext,
  type Workspace,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import type { DesktopGitController } from "../source-control";
import type { SettingsSection } from "../settings";
import type { DesktopView } from "../../components/DesktopCloudShell";
import type { useDesktopUpdates } from "../../components/DesktopUpdateControls";
import type { FilesVisibilitySettings } from "../../preferences";
import {
  formatFileOperationNotice,
  type FileClipboardController,
} from "../data-workspace/useFileClipboard";
import type { PuppyoneWorkspaceConfig } from "../../types/electron";
import type { DesktopCreateEntryAnchorInput } from "../data-workspace/nodeActions";
import { PuppyFlowEditor } from "../puppyflow/PuppyFlowEditor";
import { isPuppyFlowFile } from "../puppyflow/puppyflowModel";
import { isViewerPluginsEnabled } from "../plugins";
import type { DesktopPreferencesController } from "./useDesktopPreferences";
import type { DesktopWorkspaceSurfaceAction } from "./navigation";
import {
  useWorkspaceSurfaceContent,
  type DesktopWorkspaceCloudSurfaceController,
} from "./workspace-surfaces";
import { useDesktopViewerPacks } from "../viewer-packs/host";
import { DesktopDataWorkspaceSurface } from "./DesktopDataWorkspaceSurface";

type DataWorkspacePort = ComponentProps<typeof DataWorkspace>["dataPort"];
type DesktopUpdatesController = ReturnType<typeof useDesktopUpdates>;

type DesktopWorkspaceContentProps = {
  activeAiEditRequest: AiEditRequest | null;
  activeDataPath: string | null;
  activeView: DesktopView;
  cloud: DesktopWorkspaceCloudSurfaceController;
  dataPort: DataWorkspacePort | null;
  fileClipboardController: FileClipboardController;
  desktopUpdates: DesktopUpdatesController;
  git: DesktopGitController;
  minimalMode?: boolean;
  onActiveDataPathChange: (
    path: string | null,
    node?: DataNode | null,
    context?: DataWorkspaceActivePathChangeContext,
  ) => void | Promise<void>;
  onActiveDataNodeChange: (node: DataNode | null) => void;
  onCreateEntryMenu: (parentPath: string | null, anchorRect: DesktopCreateEntryAnchorInput) => void;
  onFilesVisibilitySettingsChange: (settings: FilesVisibilitySettings) => void;
  onNavigate: (view: DesktopView) => void;
  onNodeActionMenu: (node: DataNode, anchorRect: DOMRect, selectedNodes?: readonly DataNode[]) => void;
  onOpenSettings: () => void;
  onPuppyoneConfigChange: (config: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  onRegeneratePuppyoneProjectId: () => Promise<PuppyoneWorkspaceConfig | null>;
  onSelectSettingsSection: (section: SettingsSection) => void;
  onUnlinkWorkspace: () => Promise<void>;
  preferences: DesktopPreferencesController;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  puppyoneConfigError: string | null;
  puppyoneConfigLoading: boolean;
  puppyoneConfigSaving: boolean;
  settingsSection: SettingsSection;
  workspace: Workspace;
  workspaceSurfaceError?: string | null;
  workspaceSurfaceAction?: DesktopWorkspaceSurfaceAction | null;
  workspaceKind?: "local" | "cloud";
  workspaceKey: string;
  workspaceRefreshToken: number;
};

export function DesktopWorkspaceContent({
  activeAiEditRequest,
  activeDataPath,
  activeView,
  cloud,
  dataPort,
  fileClipboardController,
  desktopUpdates,
  git,
  minimalMode = false,
  onActiveDataPathChange,
  onActiveDataNodeChange,
  onCreateEntryMenu,
  onFilesVisibilitySettingsChange,
  onNavigate,
  onNodeActionMenu,
  onOpenSettings,
  onPuppyoneConfigChange,
  onRegeneratePuppyoneProjectId,
  onSelectSettingsSection,
  onUnlinkWorkspace,
  preferences,
  puppyoneConfig,
  puppyoneConfigError,
  puppyoneConfigLoading,
  puppyoneConfigSaving,
  settingsSection,
  workspace,
  workspaceSurfaceError = null,
  workspaceSurfaceAction = null,
  workspaceKind = "local",
  workspaceKey,
  workspaceRefreshToken,
}: DesktopWorkspaceContentProps) {
  const { t } = useLocalization();
  const fileOperationNotice = formatFileOperationNotice(fileClipboardController.notice, t);
  const cloudWorkspace = workspaceKind === "cloud";
  const viewerPluginsEnabled = isViewerPluginsEnabled({
    settings: preferences.experimentalSettings,
    workspaceIsCloud: cloudWorkspace,
  });
  const renderPreviewBody = useCallback((node: DataNode, context: FilePreviewBodyContext) => {
    if (!isPuppyFlowFile(node.name, node.type)) return undefined;

    const editor = (documentSession: EditorDocumentSession | null = null) => (
      <PuppyFlowEditor
        node={node}
        fileContent={context.fileContent}
        workspacePath={workspace?.path ?? null}
        loading={context.loading}
        error={context.error}
        documentSession={documentSession}
      />
    );

    if (!context.documentPersistence) return editor();
    return (
      <DocumentSessionBoundary
        documentId={node.path}
        initialContent={context.fileContent?.content ?? ""}
        initialVersion={context.fileContent?.version ?? null}
        saveMode="auto"
        persistence={context.documentPersistence}
        onPersisted={context.onDocumentPersisted}
      >
        {editor}
      </DocumentSessionBoundary>
    );
  }, [workspace?.path]);

  const {
    adapter: viewerExtensionAdapter,
    hostAvailable: externalViewerPacksEnabled,
    refresh: refreshViewerPackSnapshot,
    snapshot: viewerPackSnapshot,
  } = useDesktopViewerPacks({
    cloudWorkspace,
    enabled: viewerPluginsEnabled,
    workspaceKey,
    workspacePath: workspace.path,
  });
  const editorInteractionPreferences = useMemo<EditorInteractionPreferences>(() => ({
    markdownBlockDragEnabled: preferences.experimentalSettings.enableMarkdownBlockDrag,
  }), [preferences.experimentalSettings.enableMarkdownBlockDrag]);
  const {
    availableSurfaceIds,
    cloudHubNavigationEnabled,
    cloudToolsNavigationEnabled,
    gitEnabled,
    pluginsNavigationVisible,
    resolvedActiveView,
    resolvedSurface,
    workspaceChangeCount,
  } = useWorkspaceSurfaceContent({
    activeView,
    cloud,
    desktopUpdates,
    git,
    onActiveDataPathChange,
    onFilesVisibilitySettingsChange,
    onNavigate,
    onPuppyoneConfigChange,
    onRegeneratePuppyoneProjectId,
    onSelectSettingsSection,
    onUnlinkWorkspace,
    preferences,
    puppyoneConfig,
    puppyoneConfigError,
    puppyoneConfigLoading,
    puppyoneConfigSaving,
    settingsSection,
    viewerPacks: {
      hostAvailable: externalViewerPacksEnabled,
      refresh: refreshViewerPackSnapshot,
      snapshot: viewerPackSnapshot,
    },
    viewerPluginsEnabled,
    workspace,
    workspaceKind,
    workspaceRefreshToken,
  });

  if (!dataPort) {
    return resolvedSurface.content.main;
  }

  return (
    <DesktopDataWorkspaceSurface
      activeAiEditRequest={activeAiEditRequest}
      activeDataPath={activeDataPath}
      cloudWorkspace={cloudWorkspace}
      dataPort={dataPort}
      editorInteractionPreferences={editorInteractionPreferences}
      fileClipboardController={fileClipboardController}
      fileOperationNotice={fileOperationNotice}
      minimalMode={minimalMode}
      navigation={{
        activeView: resolvedActiveView,
        availableSurfaceIds,
        cloudHistoryEnabled: cloudWorkspace,
        cloudHubEnabled: cloudHubNavigationEnabled,
        cloudToolsEnabled: cloudToolsNavigationEnabled,
        gitEnabled,
        pluginsEnabled: pluginsNavigationVisible,
        gitIncomingCount: git.gitIncomingCount,
        gitOperationLoading: git.gitOperationLoading,
        gitStatus: git.activeGitStatus,
        workspaceChangeCount,
        surfaceAction: workspaceSurfaceAction,
        onNavigate,
        onOpenSettings,
      }}
      onActiveDataNodeChange={onActiveDataNodeChange}
      onActiveDataPathChange={onActiveDataPathChange}
      onCreateEntryMenu={onCreateEntryMenu}
      onNodeActionMenu={onNodeActionMenu}
      preferences={preferences}
      renderPreviewBody={renderPreviewBody}
      resolvedSurface={resolvedSurface}
      viewerExtensionAdapter={viewerExtensionAdapter}
      workspace={workspace}
      workspaceKey={workspaceKey}
      workspaceRefreshToken={workspaceRefreshToken}
      workspaceSurfaceError={workspaceSurfaceError}
    />
  );
}
