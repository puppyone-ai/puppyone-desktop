import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EditorChromeContributionProvider,
  EditorFindContributionProvider,
  FilePreview,
  getAiEditFileForPath,
  getEditorSourceRequirement,
  shouldReadEditorContent,
  useEditorChromeContributionPublisher,
  type AiEditRequest,
  type DataNode,
  type DataPort,
  type DataWorkspaceState,
  type DocumentPersistedCommit,
  type EditorGroupState,
  type EditorInteractionPreferences,
  type FileContent,
  type FileIconThemeId,
  type ViewerExtensionHostAdapter,
  type Workspace,
} from "@puppyone/shared-ui";

export type EditorPaneDocumentProps = Readonly<{
  active: boolean;
  aiEditRequest: AiEditRequest | null;
  dataPort: DataPort;
  editor: EditorGroupState["editors"][number] | null;
  editorInteractionPreferences: EditorInteractionPreferences;
  fileIconTheme: FileIconThemeId;
  refreshKey?: unknown;
  state: DataWorkspaceState;
  viewerExtensionAdapter?: ViewerExtensionHostAdapter | null;
  workspace: Workspace;
}>;

export function EditorPaneDocument({
  active,
  aiEditRequest,
  dataPort,
  editor,
  editorInteractionPreferences,
  fileIconTheme,
  refreshKey,
  state,
  viewerExtensionAdapter,
  workspace,
}: EditorPaneDocumentProps) {
  const upstreamChromePublisher = useEditorChromeContributionPublisher();
  const publishChromeContribution = useCallback(
    (contribution: Parameters<NonNullable<typeof upstreamChromePublisher>>[0]) => {
      if (active) upstreamChromePublisher?.(contribution);
    },
    [active, upstreamChromePublisher],
  );
  const treeNode = editor ? findDataNode(state.tree, editor.resource) : null;
  const fallbackNode = editor ? createFallbackNode(editor.resource, editor.label) : null;
  const source = useEditorPaneSource(treeNode ?? fallbackNode, dataPort, refreshKey);
  const node = source.content
    ? mergeNodeWithContent(treeNode ?? fallbackNode, source.content)
    : treeNode ?? fallbackNode;
  const persisted = useCallback((commit: DocumentPersistedCommit) => {
    source.applyPersistedCommit(commit);
  }, [source]);

  return (
    <EditorChromeContributionProvider onContributionChange={publishChromeContribution}>
      <EditorFindContributionProvider active={active}>
        <FilePreview
          node={node}
          fileContent={source.content}
          fileUrl={source.fileUrl}
          fileUrlLoading={source.fileUrlLoading}
          fileUrlError={source.fileUrlError}
          loading={source.loading}
          error={source.error}
          aiEditFile={getAiEditFileForPath(aiEditRequest, node?.path)}
          showHeader={false}
          hideSourceView
          fileIconTheme={fileIconTheme}
          editorInteractionPreferences={editorInteractionPreferences}
          editorSaveMode="auto"
          htmlTrustMode="safe"
          workspaceId={workspace.id}
          workspaceRoot={workspace.path}
          markdownDialect={workspace.markdownDialect ?? null}
          markdownLinkGraph={state.markdownLinkGraph}
          markdownAssetUrlResolver={state.markdownAssetUrlResolver}
          appPreview={dataPort.appPreview ?? null}
          openExternalFile={dataPort.openExternalFile}
          convertOfficeDocumentToDocx={dataPort.convertOfficeDocumentToDocx}
          viewerExtensionAdapter={viewerExtensionAdapter}
          documentSourceKind="local"
          documentPersistence={dataPort.documentPersistence ?? null}
          onDocumentPersisted={dataPort.documentPersistence && node ? persisted : undefined}
        />
      </EditorFindContributionProvider>
    </EditorChromeContributionProvider>
  );
}

function useEditorPaneSource(node: DataNode | null, dataPort: DataPort, refreshKey: unknown) {
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileUrlLoading, setFileUrlLoading] = useState(false);
  const [fileUrlError, setFileUrlError] = useState<string | null>(null);
  const nodePath = node?.path ?? null;
  const needsContent = Boolean(node && dataPort.readFile && shouldReadEditorContent(node));
  const sourceRequirement = node ? getEditorSourceRequirement(node) : "none";
  const needsResource = Boolean(
    node
    && dataPort.getFileUrl
    && (sourceRequirement === "resource" || sourceRequirement === "content-and-resource"),
  );

  useEffect(() => {
    setContent(null);
    setError(null);
    if (!nodePath || !needsContent || !dataPort.readFile) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    dataPort.readFile(nodePath, { signal: controller.signal })
      .then((nextContent) => {
        if (!controller.signal.aborted) setContent(nextContent);
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [dataPort, needsContent, nodePath, refreshKey]);

  useEffect(() => {
    setFileUrl(null);
    setFileUrlError(null);
    if (!nodePath || !needsResource || !dataPort.getFileUrl) {
      setFileUrlLoading(false);
      return undefined;
    }
    let cancelled = false;
    let activeUrl: string | null = null;
    setFileUrlLoading(true);
    Promise.resolve(dataPort.getFileUrl(nodePath))
      .then((url) => {
        if (cancelled) {
          void Promise.resolve(dataPort.revokeFileUrl?.(url)).catch(() => undefined);
          return;
        }
        activeUrl = url;
        setFileUrl(url);
      })
      .catch((nextError) => {
        if (!cancelled) setFileUrlError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) setFileUrlLoading(false);
      });
    return () => {
      cancelled = true;
      if (activeUrl) void Promise.resolve(dataPort.revokeFileUrl?.(activeUrl)).catch(() => undefined);
    };
  }, [dataPort, needsResource, nodePath]);

  const applyPersistedCommit = useCallback((commit: DocumentPersistedCommit) => {
    setContent((current) => {
      if (!node || commit.documentId !== node.path) return current;
      return current
        ? { ...current, content: commit.content, version: commit.version }
        : {
            path: node.path,
            name: node.name,
            type: node.type,
            content: commit.content,
            version: commit.version,
          };
    });
  }, [node]);

  return useMemo(() => ({
    content,
    loading: loading || (needsContent && !content && !error),
    error,
    fileUrl,
    fileUrlLoading,
    fileUrlError,
    applyPersistedCommit,
  }), [
    applyPersistedCommit,
    content,
    error,
    fileUrl,
    fileUrlError,
    fileUrlLoading,
    loading,
    needsContent,
  ]);
}

function findDataNode(nodes: readonly DataNode[], path: string): DataNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const child = findDataNode(node.children, path);
      if (child) return child;
    }
  }
  return null;
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
