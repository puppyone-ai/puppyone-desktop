import { memo, useMemo } from "react";
import {
  FilePreview,
  type AiEditFile,
  type DataNode,
  type DataPort,
  type DataWorkspaceState,
  type EditorGroupState,
  type EditorInteractionPreferences,
  type FileContent,
  type FileIconThemeId,
  type ViewerExtensionHostAdapter,
  type Workspace,
  type WorkspaceContentChange,
  workspaceContentChangeMatchesPath,
} from "@puppyone/shared-ui";
import { useEditorPaneSource } from "./useEditorPaneSource";

export type EditorPaneDocumentRuntimeProps = Readonly<{
  aiEditFile: AiEditFile | null;
  dataPort: DataPort;
  editor: EditorGroupState["editors"][number] | null;
  editorInteractionPreferences: EditorInteractionPreferences;
  fileIconTheme: FileIconThemeId;
  markdownAssetUrlResolver: DataWorkspaceState["markdownAssetUrlResolver"];
  markdownLinkGraph: DataWorkspaceState["markdownLinkGraph"];
  refreshKey?: WorkspaceContentChange;
  treeNode: DataNode | null;
  viewerExtensionAdapter?: ViewerExtensionHostAdapter | null;
  workspaceId: Workspace["id"];
  workspaceRoot: Workspace["path"];
  markdownDialect: Workspace["markdownDialect"];
}>;

/** Expensive source and Viewer boundary. Active-pane routing lives above this
 * component so focus changes do not reconcile document content. */
export const EditorPaneDocumentRuntime = memo(function EditorPaneDocumentRuntime({
  aiEditFile,
  dataPort,
  editor,
  editorInteractionPreferences,
  fileIconTheme,
  markdownAssetUrlResolver,
  markdownLinkGraph,
  refreshKey,
  treeNode,
  viewerExtensionAdapter = null,
  workspaceId,
  workspaceRoot,
  markdownDialect,
}: EditorPaneDocumentRuntimeProps) {
  const fallbackNode = useMemo(
    () => editor ? createFallbackNode(editor.resource, editor.label) : null,
    [editor],
  );
  const sourceNode = treeNode ?? fallbackNode;
  const source = useEditorPaneSource(sourceNode, dataPort, refreshKey);
  const node = useMemo(() => (
    source.content ? mergeNodeWithContent(sourceNode, source.content) : sourceNode
  ), [source.content, sourceNode]);

  return (
    <FilePreview
      node={node}
      fileContent={source.content}
      fileUrl={source.fileUrl}
      fileUrlLoading={source.fileUrlLoading}
      fileUrlError={source.fileUrlError}
      loading={source.loading}
      error={source.error}
      aiEditFile={aiEditFile}
      showHeader={false}
      hideSourceView
      fileIconTheme={fileIconTheme}
      editorInteractionPreferences={editorInteractionPreferences}
      editorSaveMode="auto"
      htmlTrustMode="safe"
      workspaceId={workspaceId}
      workspaceRoot={workspaceRoot}
      markdownDialect={markdownDialect ?? null}
      markdownLinkGraph={markdownLinkGraph}
      markdownAssetUrlResolver={markdownAssetUrlResolver}
      appPreview={dataPort.appPreview ?? null}
      openExternalFile={dataPort.openExternalFile}
      convertOfficeDocumentToDocx={dataPort.convertOfficeDocumentToDocx}
      viewerExtensionAdapter={viewerExtensionAdapter}
      documentSourceKind="local"
      documentPersistence={dataPort.documentPersistence ?? null}
      onDocumentPersisted={
        dataPort.documentPersistence && node ? source.applyPersistedCommit : undefined
      }
    />
  );
}, areEditorPaneDocumentRuntimePropsEqual);

export function areEditorPaneDocumentRuntimePropsEqual(
  previous: EditorPaneDocumentRuntimeProps,
  next: EditorPaneDocumentRuntimeProps,
): boolean {
  return previous.aiEditFile === next.aiEditFile
    && previous.dataPort === next.dataPort
    && sameEditor(previous.editor, next.editor)
    && previous.editorInteractionPreferences.showSaveStatus
      === next.editorInteractionPreferences.showSaveStatus
    && previous.editorInteractionPreferences.markdownBlockDragEnabled
      === next.editorInteractionPreferences.markdownBlockDragEnabled
    && previous.fileIconTheme === next.fileIconTheme
    && previous.markdownAssetUrlResolver === next.markdownAssetUrlResolver
    && previous.markdownLinkGraph === next.markdownLinkGraph
    && sameDocumentRefresh(previous.refreshKey, next.refreshKey, next.editor?.resource ?? null)
    && previous.treeNode === next.treeNode
    && previous.viewerExtensionAdapter === next.viewerExtensionAdapter
    && previous.workspaceId === next.workspaceId
    && previous.workspaceRoot === next.workspaceRoot
    && previous.markdownDialect === next.markdownDialect;
}

function sameDocumentRefresh(
  previous: WorkspaceContentChange | undefined,
  next: WorkspaceContentChange | undefined,
  resource: string | null,
): boolean {
  if (previous === next) return true;
  return !workspaceContentChangeMatchesPath(next, resource);
}

function sameEditor(
  previous: EditorPaneDocumentRuntimeProps["editor"],
  next: EditorPaneDocumentRuntimeProps["editor"],
): boolean {
  return previous === next || Boolean(
    previous
    && next
    && previous.id === next.id
    && previous.resource === next.resource
    && previous.label === next.label,
  );
}

function createFallbackNode(path: string, label: string): DataNode {
  return {
    id: path,
    name: label,
    path,
    type: "file",
    source: "local",
  };
}

function mergeNodeWithContent(node: DataNode | null, content: FileContent): DataNode {
  return {
    ...(node ?? createFallbackNode(content.path, content.name)),
    name: content.name,
    path: content.path,
    type: content.type,
    mimeType: content.mimeType,
    size: content.size,
  };
}
