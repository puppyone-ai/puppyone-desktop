import type {
  AppPreviewController,
  DataNode,
  DocumentPersistencePort,
  FileContent,
  OfficeDocumentConverter,
} from "../core/types";
import type { FileIconThemeId } from "../file/fileIcons";
import {
  PuppyoneEditorHost,
  type EditorSaveMode,
} from "./PuppyoneEditorHost";
import type { AiEditFile } from "./ai-edits/types";
import type {
  DocumentSourceKind,
  EditorInteractionPreferences,
  MarkdownAssetUrlResolver,
  MarkdownDialectId,
  MarkdownHtmlTrustMode,
  MarkdownLinkGraph,
  OfficeEditorActionResolver,
} from "./viewerTypes";
import type { ViewerExtensionHostAdapter } from "./viewerHostAdapters";
import type { DocumentPersistedCommit } from "./document-session/types";

export type EditorHostProps = {
  node: DataNode;
  fileContent?: FileContent | null;
  fileUrl?: string | null;
  fileUrlLoading?: boolean;
  fileUrlError?: string | null;
  loading?: boolean;
  error?: string | null;
  documentPersistence?: DocumentPersistencePort | null;
  onDocumentPersisted?: (commit: DocumentPersistedCommit) => void;
  aiEditFile?: AiEditFile | null;
  hideSourceView?: boolean;
  fileIconTheme?: FileIconThemeId;
  editorInteractionPreferences?: EditorInteractionPreferences;
  saveMode?: EditorSaveMode;
  htmlTrustMode?: MarkdownHtmlTrustMode;
  workspaceId?: string;
  workspaceRoot?: string | null;
  markdownDialect?: MarkdownDialectId | null;
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  appPreview?: AppPreviewController | null;
  openExternalFile?: (path: string) => Promise<void>;
  convertOfficeDocumentToDocx?: OfficeDocumentConverter;
  resolveOfficeEditorActions?: OfficeEditorActionResolver | null;
  deferFallbackContent?: boolean;
  viewerExtensionAdapter?: ViewerExtensionHostAdapter | null;
  documentSourceKind?: DocumentSourceKind;
  onSurfaceReady?: () => void;
};

export function EditorHost({
  node,
  fileContent,
  fileUrl = null,
  fileUrlLoading = false,
  fileUrlError = null,
  loading = false,
  error = null,
  documentPersistence = null,
  onDocumentPersisted,
  aiEditFile = null,
  hideSourceView = false,
  fileIconTheme = "default",
  editorInteractionPreferences,
  saveMode = "manual",
  htmlTrustMode = "safe",
  workspaceId = "",
  workspaceRoot = null,
  markdownDialect = null,
  markdownLinkGraph = null,
  markdownAssetUrlResolver = null,
  appPreview = null,
  openExternalFile,
  convertOfficeDocumentToDocx,
  resolveOfficeEditorActions = null,
  deferFallbackContent = false,
  viewerExtensionAdapter = null,
  documentSourceKind = "local",
  onSurfaceReady,
}: EditorHostProps) {
  return (
    <PuppyoneEditorHost
      document={{
        path: node.path,
        name: node.name,
        type: fileContent?.type ?? node.type,
        content: fileContent
          ? fileContent.content
          : (deferFallbackContent ? undefined : node.content),
        preview: deferFallbackContent ? undefined : node.preview,
        mimeType: fileContent?.mimeType ?? node.mimeType ?? null,
        url: fileContent?.url ?? fileUrl,
        version: fileContent?.version ?? null,
        sourceKind: documentSourceKind,
        markdownDialect,
      }}
      viewerExtensionAdapter={viewerExtensionAdapter}
      loading={loading}
      error={error}
      fileUrlLoading={fileUrlLoading}
      fileUrlError={fileUrlError}
      documentPersistence={documentPersistence}
      onDocumentPersisted={onDocumentPersisted}
      aiEditFile={aiEditFile}
      hideSourceView={hideSourceView}
      fileIconTheme={fileIconTheme}
      editorInteractionPreferences={editorInteractionPreferences}
      saveMode={saveMode}
      htmlTrustMode={htmlTrustMode}
      workspaceId={workspaceId}
      workspaceRoot={workspaceRoot}
      markdownLinkGraph={markdownLinkGraph}
      markdownAssetUrlResolver={markdownAssetUrlResolver}
      appPreview={appPreview}
      openExternalFile={openExternalFile}
      convertOfficeDocumentToDocx={convertOfficeDocumentToDocx}
      resolveOfficeEditorActions={resolveOfficeEditorActions}
      onSurfaceReady={onSurfaceReady}
    />
  );
}
