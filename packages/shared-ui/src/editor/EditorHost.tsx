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
  MarkdownHtmlTrustMode,
  MarkdownLinkGraph,
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
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  appPreview?: AppPreviewController | null;
  openExternalFile?: (path: string) => Promise<void>;
  convertOfficeDocumentToDocx?: OfficeDocumentConverter;
  deferFallbackContent?: boolean;
  viewerExtensionAdapter?: ViewerExtensionHostAdapter | null;
  documentSourceKind?: DocumentSourceKind;
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
  markdownLinkGraph = null,
  markdownAssetUrlResolver = null,
  appPreview = null,
  openExternalFile,
  convertOfficeDocumentToDocx,
  deferFallbackContent = false,
  viewerExtensionAdapter = null,
  documentSourceKind = "local",
}: EditorHostProps) {
  return (
    <PuppyoneEditorHost
      document={{
        path: node.path,
        name: node.name,
        type: fileContent?.type ?? node.type,
        content: fileContent?.content ?? (deferFallbackContent ? undefined : node.content),
        preview: deferFallbackContent ? undefined : node.preview,
        mimeType: fileContent?.mimeType ?? node.mimeType ?? null,
        url: fileContent?.url ?? fileUrl,
        version: fileContent?.version ?? null,
        sourceKind: documentSourceKind,
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
    />
  );
}
