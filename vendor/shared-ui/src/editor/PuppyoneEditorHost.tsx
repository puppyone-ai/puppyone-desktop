"use client";

import { resolveEditorViewer } from "./viewerRegistry";
import type { EditorDocument, EditorSaveMode, MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "./viewerTypes";
import type { AppPreviewController, OfficeDocumentConverter } from "../core/types";
import type { FileIconThemeId } from "../file/fileIcons";
import type { AiEditFile } from "./ai-edits/types";

export type { EditorDocument, EditorDocumentKind, EditorSaveMode, MarkdownHtmlTrustMode } from "./viewerTypes";

export type PuppyoneEditorHostProps = {
  document: EditorDocument;
  loading?: boolean;
  error?: string | null;
  fileUrlLoading?: boolean;
  fileUrlError?: string | null;
  onSaveContent?: (content: string) => Promise<void>;
  aiEditFile?: AiEditFile | null;
  hideSourceView?: boolean;
  fileIconTheme?: FileIconThemeId;
  saveMode?: EditorSaveMode;
  htmlTrustMode?: MarkdownHtmlTrustMode;
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  appPreview?: AppPreviewController | null;
  openExternalFile?: (path: string) => Promise<void>;
  convertOfficeDocumentToDocx?: OfficeDocumentConverter;
};

export function PuppyoneEditorHost({
  document,
  loading = false,
  error = null,
  fileUrlLoading = false,
  fileUrlError = null,
  onSaveContent,
  aiEditFile = null,
  hideSourceView = false,
  fileIconTheme = "default",
  saveMode = "manual",
  htmlTrustMode = "safe",
  markdownLinkGraph = null,
  markdownAssetUrlResolver = null,
  appPreview = null,
  openExternalFile,
  convertOfficeDocumentToDocx,
}: PuppyoneEditorHostProps) {
  const { viewer, format, resolvedExtension } = resolveEditorViewer(document);
  const rawContent = viewer.allowPreviewContent === false
    ? document.content ?? ""
    : document.content ?? document.preview ?? "";
  const content = viewer.normalizeContent?.(rawContent, document) ?? rawContent;
  const canEdit = Boolean(onSaveContent && viewer.isEditable?.({ document, format, resolvedExtension, content }));

  if (viewer.source !== "resource" && loading && !content) {
    return <div className="editor-state">Loading file...</div>;
  }

  if (viewer.source !== "resource" && error && !content) {
    return (
      <EditorUnavailableState
        title="Cannot open in editor"
        message={error}
        documentPath={document.path}
        openExternalFile={openExternalFile}
      />
    );
  }

  return (
    <>
      {viewer.render({
        document,
        format,
        resolvedExtension,
        content,
        aiEditFile,
        fileUrl: document.url,
        fileUrlLoading,
        fileUrlError,
        loading,
        error,
        canEdit,
        hideSourceView,
        fileIconTheme,
        saveMode,
        htmlTrustMode,
        markdownLinkGraph,
        markdownAssetUrlResolver,
        appPreview,
        openExternalFile,
        convertOfficeDocumentToDocx,
        onSaveContent,
      })}
    </>
  );
}

function EditorUnavailableState({
  title,
  message,
  documentPath,
  openExternalFile,
}: {
  title: string;
  message: string;
  documentPath: string;
  openExternalFile?: (path: string) => Promise<void>;
}) {
  return (
    <div className="editor-state editor-state--stacked danger">
      <strong>{title}</strong>
      <span>{message}</span>
      {openExternalFile && (
        <button type="button" onClick={() => void openExternalFile(documentPath)}>
          Open in default app
        </button>
      )}
    </div>
  );
}
