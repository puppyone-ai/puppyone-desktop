import type { AppPreviewController, DataNode, FileContent, OfficeDocumentConverter } from "../core/types";
import type { FileIconThemeId } from "../file/fileIcons";
import {
  PuppyoneEditorHost,
  type EditorSaveMode,
  type ViewerPackInstallFallbackRenderer,
} from "./PuppyoneEditorHost";
import type { AiEditFile } from "./ai-edits/types";
import type {
  DocumentSourceKind,
  ExternalViewerSurfaceRenderer,
  MarkdownAssetUrlResolver,
  MarkdownHtmlTrustMode,
  MarkdownLinkGraph,
} from "./viewerTypes";
import type { ViewerPackSnapshot } from "./viewerPackTypes";

export type EditorHostProps = {
  node: DataNode;
  fileContent?: FileContent | null;
  fileUrl?: string | null;
  fileUrlLoading?: boolean;
  fileUrlError?: string | null;
  loading?: boolean;
  error?: string | null;
  onSaveContent?: (content: string) => Promise<void>;
  aiEditFile?: AiEditFile | null;
  hideSourceView?: boolean;
  fileIconTheme?: FileIconThemeId;
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
  viewerPackSnapshot?: ViewerPackSnapshot | null;
  externalViewerSurface?: ExternalViewerSurfaceRenderer | null;
  viewerPackInstallFallback?: ViewerPackInstallFallbackRenderer | null;
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
  onSaveContent,
  aiEditFile = null,
  hideSourceView = false,
  fileIconTheme = "default",
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
  viewerPackSnapshot = null,
  externalViewerSurface = null,
  viewerPackInstallFallback = null,
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
        sourceKind: documentSourceKind,
      }}
      viewerPackSnapshot={viewerPackSnapshot}
      externalViewerSurface={externalViewerSurface}
      viewerPackInstallFallback={viewerPackInstallFallback}
      loading={loading}
      error={error}
      fileUrlLoading={fileUrlLoading}
      fileUrlError={fileUrlError}
      onSaveContent={onSaveContent}
      aiEditFile={aiEditFile}
      hideSourceView={hideSourceView}
      fileIconTheme={fileIconTheme}
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
